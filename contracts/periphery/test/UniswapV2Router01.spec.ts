import chai, { expect } from 'chai'
import { Contract } from 'ethers'
import { AddressZero, Zero, MaxUint256 } from 'ethers/constants'
import { BigNumber, bigNumberify } from 'ethers/utils'
import { solidity, MockProvider, createFixtureLoader } from 'ethereum-waffle'
import { ecsign } from 'ethereumjs-util'

import { expandTo18Decimals, getApprovalDigest, mineBlock, MINIMUM_LIQUIDITY } from './shared/utilities'
import { v2Fixture } from './shared/fixtures'

chai.use(solidity)

const overrides = {
  gasLimit: 9999999
}

enum RouterVersion {
  UniswapV2Router01 = 'UniswapV2Router01',
  UniswapV2Router02 = 'UniswapV2Router02'
}

describe('UniswapV2Router{01,02}', () => {
  for (const routerVersion of Object.keys(RouterVersion)) {
    const provider = new MockProvider({
      hardfork: 'istanbul',
      mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
      gasLimit: 9999999
    })
    const [wallet] = provider.getWallets()
    const loadFixture = createFixtureLoader(provider, [wallet])

    let token0: Contract
    let token1: Contract
    let WUSDC: Contract
    let WUSDCPartner: Contract
    let factory: Contract
    let router: Contract
    let pair: Contract
    let WUSDCPair: Contract
    let routerEventEmitter: Contract
    beforeEach(async function() {
      const fixture = await loadFixture(v2Fixture)
      token0 = fixture.token0
      token1 = fixture.token1
      WUSDC = fixture.WUSDC
      WUSDCPartner = fixture.WUSDCPartner
      factory = fixture.factoryV2
      router = {
        [RouterVersion.UniswapV2Router01]: fixture.router01,
        [RouterVersion.UniswapV2Router02]: fixture.router02
      }[routerVersion as RouterVersion]
      pair = fixture.pair
      WUSDCPair = fixture.WUSDCPair
      routerEventEmitter = fixture.routerEventEmitter
    })

    afterEach(async function() {
      expect(await provider.getBalance(router.address)).to.eq(Zero)
    })

    describe(routerVersion, () => {
      it('factory, WUSDC', async () => {
        expect(await router.factory()).to.eq(factory.address)
        expect(await router.WUSDC()).to.eq(WUSDC.address)
      })

      it('addLiquidity', async () => {
        const token0Amount = expandTo18Decimals(1)
        const token1Amount = expandTo18Decimals(4)

        const expectedLiquidity = expandTo18Decimals(2)
        await token0.approve(router.address, MaxUint256)
        await token1.approve(router.address, MaxUint256)
        await expect(
          router.addLiquidity(
            token0.address,
            token1.address,
            token0Amount,
            token1Amount,
            0,
            0,
            wallet.address,
            MaxUint256,
            overrides
          )
        )
          .to.emit(token0, 'Transfer')
          .withArgs(wallet.address, pair.address, token0Amount)
          .to.emit(token1, 'Transfer')
          .withArgs(wallet.address, pair.address, token1Amount)
          .to.emit(pair, 'Transfer')
          .withArgs(AddressZero, AddressZero, MINIMUM_LIQUIDITY)
          .to.emit(pair, 'Transfer')
          .withArgs(AddressZero, wallet.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(pair, 'Sync')
          .withArgs(token0Amount, token1Amount)
          .to.emit(pair, 'Mint')
          .withArgs(router.address, token0Amount, token1Amount)

        expect(await pair.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
      })

      it('addLiquidityETH', async () => {
        const WUSDCPartnerAmount = expandTo18Decimals(1)
        const ETHAmount = expandTo18Decimals(4)

        const expectedLiquidity = expandTo18Decimals(2)
        const WUSDCPairToken0 = await WUSDCPair.token0()
        await WUSDCPartner.approve(router.address, MaxUint256)
        await expect(
          router.addLiquidityETH(
            WUSDCPartner.address,
            WUSDCPartnerAmount,
            WUSDCPartnerAmount,
            ETHAmount,
            wallet.address,
            MaxUint256,
            { ...overrides, value: ETHAmount }
          )
        )
          .to.emit(WUSDCPair, 'Transfer')
          .withArgs(AddressZero, AddressZero, MINIMUM_LIQUIDITY)
          .to.emit(WUSDCPair, 'Transfer')
          .withArgs(AddressZero, wallet.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(WUSDCPair, 'Sync')
          .withArgs(
            WUSDCPairToken0 === WUSDCPartner.address ? WUSDCPartnerAmount : ETHAmount,
            WUSDCPairToken0 === WUSDCPartner.address ? ETHAmount : WUSDCPartnerAmount
          )
          .to.emit(WUSDCPair, 'Mint')
          .withArgs(
            router.address,
            WUSDCPairToken0 === WUSDCPartner.address ? WUSDCPartnerAmount : ETHAmount,
            WUSDCPairToken0 === WUSDCPartner.address ? ETHAmount : WUSDCPartnerAmount
          )

        expect(await WUSDCPair.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
      })

      async function addLiquidity(token0Amount: BigNumber, token1Amount: BigNumber) {
        await token0.transfer(pair.address, token0Amount)
        await token1.transfer(pair.address, token1Amount)
        await pair.mint(wallet.address, overrides)
      }
      it('removeLiquidity', async () => {
        const token0Amount = expandTo18Decimals(1)
        const token1Amount = expandTo18Decimals(4)
        await addLiquidity(token0Amount, token1Amount)

        const expectedLiquidity = expandTo18Decimals(2)
        await pair.approve(router.address, MaxUint256)
        await expect(
          router.removeLiquidity(
            token0.address,
            token1.address,
            expectedLiquidity.sub(MINIMUM_LIQUIDITY),
            0,
            0,
            wallet.address,
            MaxUint256,
            overrides
          )
        )
          .to.emit(pair, 'Transfer')
          .withArgs(wallet.address, pair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(pair, 'Transfer')
          .withArgs(pair.address, AddressZero, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(token0, 'Transfer')
          .withArgs(pair.address, wallet.address, token0Amount.sub(500))
          .to.emit(token1, 'Transfer')
          .withArgs(pair.address, wallet.address, token1Amount.sub(2000))
          .to.emit(pair, 'Sync')
          .withArgs(500, 2000)
          .to.emit(pair, 'Burn')
          .withArgs(router.address, token0Amount.sub(500), token1Amount.sub(2000), wallet.address)

        expect(await pair.balanceOf(wallet.address)).to.eq(0)
        const totalSupplyToken0 = await token0.totalSupply()
        const totalSupplyToken1 = await token1.totalSupply()
        expect(await token0.balanceOf(wallet.address)).to.eq(totalSupplyToken0.sub(500))
        expect(await token1.balanceOf(wallet.address)).to.eq(totalSupplyToken1.sub(2000))
      })

      it('removeLiquidityETH', async () => {
        const WUSDCPartnerAmount = expandTo18Decimals(1)
        const ETHAmount = expandTo18Decimals(4)
        await WUSDCPartner.transfer(WUSDCPair.address, WUSDCPartnerAmount)
        await WUSDC.deposit({ value: ETHAmount })
        await WUSDC.transfer(WUSDCPair.address, ETHAmount)
        await WUSDCPair.mint(wallet.address, overrides)

        const expectedLiquidity = expandTo18Decimals(2)
        const WUSDCPairToken0 = await WUSDCPair.token0()
        await WUSDCPair.approve(router.address, MaxUint256)
        await expect(
          router.removeLiquidityETH(
            WUSDCPartner.address,
            expectedLiquidity.sub(MINIMUM_LIQUIDITY),
            0,
            0,
            wallet.address,
            MaxUint256,
            overrides
          )
        )
          .to.emit(WUSDCPair, 'Transfer')
          .withArgs(wallet.address, WUSDCPair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(WUSDCPair, 'Transfer')
          .withArgs(WUSDCPair.address, AddressZero, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(WUSDC, 'Transfer')
          .withArgs(WUSDCPair.address, router.address, ETHAmount.sub(2000))
          .to.emit(WUSDCPartner, 'Transfer')
          .withArgs(WUSDCPair.address, router.address, WUSDCPartnerAmount.sub(500))
          .to.emit(WUSDCPartner, 'Transfer')
          .withArgs(router.address, wallet.address, WUSDCPartnerAmount.sub(500))
          .to.emit(WUSDCPair, 'Sync')
          .withArgs(
            WUSDCPairToken0 === WUSDCPartner.address ? 500 : 2000,
            WUSDCPairToken0 === WUSDCPartner.address ? 2000 : 500
          )
          .to.emit(WUSDCPair, 'Burn')
          .withArgs(
            router.address,
            WUSDCPairToken0 === WUSDCPartner.address ? WUSDCPartnerAmount.sub(500) : ETHAmount.sub(2000),
            WUSDCPairToken0 === WUSDCPartner.address ? ETHAmount.sub(2000) : WUSDCPartnerAmount.sub(500),
            router.address
          )

        expect(await WUSDCPair.balanceOf(wallet.address)).to.eq(0)
        const totalSupplyWUSDCPartner = await WUSDCPartner.totalSupply()
        const totalSupplyWUSDC = await WUSDC.totalSupply()
        expect(await WUSDCPartner.balanceOf(wallet.address)).to.eq(totalSupplyWUSDCPartner.sub(500))
        expect(await WUSDC.balanceOf(wallet.address)).to.eq(totalSupplyWUSDC.sub(2000))
      })

      it('removeLiquidityWithPermit', async () => {
        const token0Amount = expandTo18Decimals(1)
        const token1Amount = expandTo18Decimals(4)
        await addLiquidity(token0Amount, token1Amount)

        const expectedLiquidity = expandTo18Decimals(2)

        const nonce = await pair.nonces(wallet.address)
        const digest = await getApprovalDigest(
          pair,
          { owner: wallet.address, spender: router.address, value: expectedLiquidity.sub(MINIMUM_LIQUIDITY) },
          nonce,
          MaxUint256
        )

        const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))

        await router.removeLiquidityWithPermit(
          token0.address,
          token1.address,
          expectedLiquidity.sub(MINIMUM_LIQUIDITY),
          0,
          0,
          wallet.address,
          MaxUint256,
          false,
          v,
          r,
          s,
          overrides
        )
      })

      it('removeLiquidityETHWithPermit', async () => {
        const WUSDCPartnerAmount = expandTo18Decimals(1)
        const ETHAmount = expandTo18Decimals(4)
        await WUSDCPartner.transfer(WUSDCPair.address, WUSDCPartnerAmount)
        await WUSDC.deposit({ value: ETHAmount })
        await WUSDC.transfer(WUSDCPair.address, ETHAmount)
        await WUSDCPair.mint(wallet.address, overrides)

        const expectedLiquidity = expandTo18Decimals(2)

        const nonce = await WUSDCPair.nonces(wallet.address)
        const digest = await getApprovalDigest(
          WUSDCPair,
          { owner: wallet.address, spender: router.address, value: expectedLiquidity.sub(MINIMUM_LIQUIDITY) },
          nonce,
          MaxUint256
        )

        const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))

        await router.removeLiquidityETHWithPermit(
          WUSDCPartner.address,
          expectedLiquidity.sub(MINIMUM_LIQUIDITY),
          0,
          0,
          wallet.address,
          MaxUint256,
          false,
          v,
          r,
          s,
          overrides
        )
      })

      describe('swapExactTokensForTokens', () => {
        const token0Amount = expandTo18Decimals(5)
        const token1Amount = expandTo18Decimals(10)
        const swapAmount = expandTo18Decimals(1)
        const expectedOutputAmount = bigNumberify('1662497915624478906')

        beforeEach(async () => {
          await addLiquidity(token0Amount, token1Amount)
          await token0.approve(router.address, MaxUint256)
        })

        it('happy path', async () => {
          await expect(
            router.swapExactTokensForTokens(
              swapAmount,
              0,
              [token0.address, token1.address],
              wallet.address,
              MaxUint256,
              overrides
            )
          )
            .to.emit(token0, 'Transfer')
            .withArgs(wallet.address, pair.address, swapAmount)
            .to.emit(token1, 'Transfer')
            .withArgs(pair.address, wallet.address, expectedOutputAmount)
            .to.emit(pair, 'Sync')
            .withArgs(token0Amount.add(swapAmount), token1Amount.sub(expectedOutputAmount))
            .to.emit(pair, 'Swap')
            .withArgs(router.address, swapAmount, 0, 0, expectedOutputAmount, wallet.address)
        })

        it('amounts', async () => {
          await token0.approve(routerEventEmitter.address, MaxUint256)
          await expect(
            routerEventEmitter.swapExactTokensForTokens(
              router.address,
              swapAmount,
              0,
              [token0.address, token1.address],
              wallet.address,
              MaxUint256,
              overrides
            )
          )
            .to.emit(routerEventEmitter, 'Amounts')
            .withArgs([swapAmount, expectedOutputAmount])
        })

        it('gas', async () => {
          // ensure that setting price{0,1}CumulativeLast for the first time doesn't affect our gas math
          await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
          await pair.sync(overrides)

          await token0.approve(router.address, MaxUint256)
          await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
          const tx = await router.swapExactTokensForTokens(
            swapAmount,
            0,
            [token0.address, token1.address],
            wallet.address,
            MaxUint256,
            overrides
          )
          const receipt = await tx.wait()
          expect(receipt.gasUsed).to.eq(
            {
              [RouterVersion.UniswapV2Router01]: 101876,
              [RouterVersion.UniswapV2Router02]: 101898
            }[routerVersion as RouterVersion]
          )
        }).retries(3)
      })

      describe('swapTokensForExactTokens', () => {
        const token0Amount = expandTo18Decimals(5)
        const token1Amount = expandTo18Decimals(10)
        const expectedSwapAmount = bigNumberify('557227237267357629')
        const outputAmount = expandTo18Decimals(1)

        beforeEach(async () => {
          await addLiquidity(token0Amount, token1Amount)
        })

        it('happy path', async () => {
          await token0.approve(router.address, MaxUint256)
          await expect(
            router.swapTokensForExactTokens(
              outputAmount,
              MaxUint256,
              [token0.address, token1.address],
              wallet.address,
              MaxUint256,
              overrides
            )
          )
            .to.emit(token0, 'Transfer')
            .withArgs(wallet.address, pair.address, expectedSwapAmount)
            .to.emit(token1, 'Transfer')
            .withArgs(pair.address, wallet.address, outputAmount)
            .to.emit(pair, 'Sync')
            .withArgs(token0Amount.add(expectedSwapAmount), token1Amount.sub(outputAmount))
            .to.emit(pair, 'Swap')
            .withArgs(router.address, expectedSwapAmount, 0, 0, outputAmount, wallet.address)
        })

        it('amounts', async () => {
          await token0.approve(routerEventEmitter.address, MaxUint256)
          await expect(
            routerEventEmitter.swapTokensForExactTokens(
              router.address,
              outputAmount,
              MaxUint256,
              [token0.address, token1.address],
              wallet.address,
              MaxUint256,
              overrides
            )
          )
            .to.emit(routerEventEmitter, 'Amounts')
            .withArgs([expectedSwapAmount, outputAmount])
        })
      })

      describe('swapExactETHForTokens', () => {
        const WUSDCPartnerAmount = expandTo18Decimals(10)
        const ETHAmount = expandTo18Decimals(5)
        const swapAmount = expandTo18Decimals(1)
        const expectedOutputAmount = bigNumberify('1662497915624478906')

        beforeEach(async () => {
          await WUSDCPartner.transfer(WUSDCPair.address, WUSDCPartnerAmount)
          await WUSDC.deposit({ value: ETHAmount })
          await WUSDC.transfer(WUSDCPair.address, ETHAmount)
          await WUSDCPair.mint(wallet.address, overrides)

          await token0.approve(router.address, MaxUint256)
        })

        it('happy path', async () => {
          const WUSDCPairToken0 = await WUSDCPair.token0()
          await expect(
            router.swapExactETHForTokens(0, [WUSDC.address, WUSDCPartner.address], wallet.address, MaxUint256, {
              ...overrides,
              value: swapAmount
            })
          )
            .to.emit(WUSDC, 'Transfer')
            .withArgs(router.address, WUSDCPair.address, swapAmount)
            .to.emit(WUSDCPartner, 'Transfer')
            .withArgs(WUSDCPair.address, wallet.address, expectedOutputAmount)
            .to.emit(WUSDCPair, 'Sync')
            .withArgs(
              WUSDCPairToken0 === WUSDCPartner.address
                ? WUSDCPartnerAmount.sub(expectedOutputAmount)
                : ETHAmount.add(swapAmount),
              WUSDCPairToken0 === WUSDCPartner.address
                ? ETHAmount.add(swapAmount)
                : WUSDCPartnerAmount.sub(expectedOutputAmount)
            )
            .to.emit(WUSDCPair, 'Swap')
            .withArgs(
              router.address,
              WUSDCPairToken0 === WUSDCPartner.address ? 0 : swapAmount,
              WUSDCPairToken0 === WUSDCPartner.address ? swapAmount : 0,
              WUSDCPairToken0 === WUSDCPartner.address ? expectedOutputAmount : 0,
              WUSDCPairToken0 === WUSDCPartner.address ? 0 : expectedOutputAmount,
              wallet.address
            )
        })

        it('amounts', async () => {
          await expect(
            routerEventEmitter.swapExactETHForTokens(
              router.address,
              0,
              [WUSDC.address, WUSDCPartner.address],
              wallet.address,
              MaxUint256,
              {
                ...overrides,
                value: swapAmount
              }
            )
          )
            .to.emit(routerEventEmitter, 'Amounts')
            .withArgs([swapAmount, expectedOutputAmount])
        })

        it('gas', async () => {
          const WUSDCPartnerAmount = expandTo18Decimals(10)
          const ETHAmount = expandTo18Decimals(5)
          await WUSDCPartner.transfer(WUSDCPair.address, WUSDCPartnerAmount)
          await WUSDC.deposit({ value: ETHAmount })
          await WUSDC.transfer(WUSDCPair.address, ETHAmount)
          await WUSDCPair.mint(wallet.address, overrides)

          // ensure that setting price{0,1}CumulativeLast for the first time doesn't affect our gas math
          await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
          await pair.sync(overrides)

          const swapAmount = expandTo18Decimals(1)
          await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
          const tx = await router.swapExactETHForTokens(
            0,
            [WUSDC.address, WUSDCPartner.address],
            wallet.address,
            MaxUint256,
            {
              ...overrides,
              value: swapAmount
            }
          )
          const receipt = await tx.wait()
          expect(receipt.gasUsed).to.eq(
            {
              [RouterVersion.UniswapV2Router01]: 138770,
              [RouterVersion.UniswapV2Router02]: 138770
            }[routerVersion as RouterVersion]
          )
        }).retries(3)
      })

      describe('swapTokensForExactETH', () => {
        const WUSDCPartnerAmount = expandTo18Decimals(5)
        const ETHAmount = expandTo18Decimals(10)
        const expectedSwapAmount = bigNumberify('557227237267357629')
        const outputAmount = expandTo18Decimals(1)

        beforeEach(async () => {
          await WUSDCPartner.transfer(WUSDCPair.address, WUSDCPartnerAmount)
          await WUSDC.deposit({ value: ETHAmount })
          await WUSDC.transfer(WUSDCPair.address, ETHAmount)
          await WUSDCPair.mint(wallet.address, overrides)
        })

        it('happy path', async () => {
          await WUSDCPartner.approve(router.address, MaxUint256)
          const WUSDCPairToken0 = await WUSDCPair.token0()
          await expect(
            router.swapTokensForExactETH(
              outputAmount,
              MaxUint256,
              [WUSDCPartner.address, WUSDC.address],
              wallet.address,
              MaxUint256,
              overrides
            )
          )
            .to.emit(WUSDCPartner, 'Transfer')
            .withArgs(wallet.address, WUSDCPair.address, expectedSwapAmount)
            .to.emit(WUSDC, 'Transfer')
            .withArgs(WUSDCPair.address, router.address, outputAmount)
            .to.emit(WUSDCPair, 'Sync')
            .withArgs(
              WUSDCPairToken0 === WUSDCPartner.address
                ? WUSDCPartnerAmount.add(expectedSwapAmount)
                : ETHAmount.sub(outputAmount),
              WUSDCPairToken0 === WUSDCPartner.address
                ? ETHAmount.sub(outputAmount)
                : WUSDCPartnerAmount.add(expectedSwapAmount)
            )
            .to.emit(WUSDCPair, 'Swap')
            .withArgs(
              router.address,
              WUSDCPairToken0 === WUSDCPartner.address ? expectedSwapAmount : 0,
              WUSDCPairToken0 === WUSDCPartner.address ? 0 : expectedSwapAmount,
              WUSDCPairToken0 === WUSDCPartner.address ? 0 : outputAmount,
              WUSDCPairToken0 === WUSDCPartner.address ? outputAmount : 0,
              router.address
            )
        })

        it('amounts', async () => {
          await WUSDCPartner.approve(routerEventEmitter.address, MaxUint256)
          await expect(
            routerEventEmitter.swapTokensForExactETH(
              router.address,
              outputAmount,
              MaxUint256,
              [WUSDCPartner.address, WUSDC.address],
              wallet.address,
              MaxUint256,
              overrides
            )
          )
            .to.emit(routerEventEmitter, 'Amounts')
            .withArgs([expectedSwapAmount, outputAmount])
        })
      })

      describe('swapExactTokensForETH', () => {
        const WUSDCPartnerAmount = expandTo18Decimals(5)
        const ETHAmount = expandTo18Decimals(10)
        const swapAmount = expandTo18Decimals(1)
        const expectedOutputAmount = bigNumberify('1662497915624478906')

        beforeEach(async () => {
          await WUSDCPartner.transfer(WUSDCPair.address, WUSDCPartnerAmount)
          await WUSDC.deposit({ value: ETHAmount })
          await WUSDC.transfer(WUSDCPair.address, ETHAmount)
          await WUSDCPair.mint(wallet.address, overrides)
        })

        it('happy path', async () => {
          await WUSDCPartner.approve(router.address, MaxUint256)
          const WUSDCPairToken0 = await WUSDCPair.token0()
          await expect(
            router.swapExactTokensForETH(
              swapAmount,
              0,
              [WUSDCPartner.address, WUSDC.address],
              wallet.address,
              MaxUint256,
              overrides
            )
          )
            .to.emit(WUSDCPartner, 'Transfer')
            .withArgs(wallet.address, WUSDCPair.address, swapAmount)
            .to.emit(WUSDC, 'Transfer')
            .withArgs(WUSDCPair.address, router.address, expectedOutputAmount)
            .to.emit(WUSDCPair, 'Sync')
            .withArgs(
              WUSDCPairToken0 === WUSDCPartner.address
                ? WUSDCPartnerAmount.add(swapAmount)
                : ETHAmount.sub(expectedOutputAmount),
              WUSDCPairToken0 === WUSDCPartner.address
                ? ETHAmount.sub(expectedOutputAmount)
                : WUSDCPartnerAmount.add(swapAmount)
            )
            .to.emit(WUSDCPair, 'Swap')
            .withArgs(
              router.address,
              WUSDCPairToken0 === WUSDCPartner.address ? swapAmount : 0,
              WUSDCPairToken0 === WUSDCPartner.address ? 0 : swapAmount,
              WUSDCPairToken0 === WUSDCPartner.address ? 0 : expectedOutputAmount,
              WUSDCPairToken0 === WUSDCPartner.address ? expectedOutputAmount : 0,
              router.address
            )
        })

        it('amounts', async () => {
          await WUSDCPartner.approve(routerEventEmitter.address, MaxUint256)
          await expect(
            routerEventEmitter.swapExactTokensForETH(
              router.address,
              swapAmount,
              0,
              [WUSDCPartner.address, WUSDC.address],
              wallet.address,
              MaxUint256,
              overrides
            )
          )
            .to.emit(routerEventEmitter, 'Amounts')
            .withArgs([swapAmount, expectedOutputAmount])
        })
      })

      describe('swapETHForExactTokens', () => {
        const WUSDCPartnerAmount = expandTo18Decimals(10)
        const ETHAmount = expandTo18Decimals(5)
        const expectedSwapAmount = bigNumberify('557227237267357629')
        const outputAmount = expandTo18Decimals(1)

        beforeEach(async () => {
          await WUSDCPartner.transfer(WUSDCPair.address, WUSDCPartnerAmount)
          await WUSDC.deposit({ value: ETHAmount })
          await WUSDC.transfer(WUSDCPair.address, ETHAmount)
          await WUSDCPair.mint(wallet.address, overrides)
        })

        it('happy path', async () => {
          const WUSDCPairToken0 = await WUSDCPair.token0()
          await expect(
            router.swapETHForExactTokens(
              outputAmount,
              [WUSDC.address, WUSDCPartner.address],
              wallet.address,
              MaxUint256,
              {
                ...overrides,
                value: expectedSwapAmount
              }
            )
          )
            .to.emit(WUSDC, 'Transfer')
            .withArgs(router.address, WUSDCPair.address, expectedSwapAmount)
            .to.emit(WUSDCPartner, 'Transfer')
            .withArgs(WUSDCPair.address, wallet.address, outputAmount)
            .to.emit(WUSDCPair, 'Sync')
            .withArgs(
              WUSDCPairToken0 === WUSDCPartner.address
                ? WUSDCPartnerAmount.sub(outputAmount)
                : ETHAmount.add(expectedSwapAmount),
              WUSDCPairToken0 === WUSDCPartner.address
                ? ETHAmount.add(expectedSwapAmount)
                : WUSDCPartnerAmount.sub(outputAmount)
            )
            .to.emit(WUSDCPair, 'Swap')
            .withArgs(
              router.address,
              WUSDCPairToken0 === WUSDCPartner.address ? 0 : expectedSwapAmount,
              WUSDCPairToken0 === WUSDCPartner.address ? expectedSwapAmount : 0,
              WUSDCPairToken0 === WUSDCPartner.address ? outputAmount : 0,
              WUSDCPairToken0 === WUSDCPartner.address ? 0 : outputAmount,
              wallet.address
            )
        })

        it('amounts', async () => {
          await expect(
            routerEventEmitter.swapETHForExactTokens(
              router.address,
              outputAmount,
              [WUSDC.address, WUSDCPartner.address],
              wallet.address,
              MaxUint256,
              {
                ...overrides,
                value: expectedSwapAmount
              }
            )
          )
            .to.emit(routerEventEmitter, 'Amounts')
            .withArgs([expectedSwapAmount, outputAmount])
        })
      })
    })
  }
})
