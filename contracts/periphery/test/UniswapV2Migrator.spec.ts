import chai, { expect } from 'chai'
import { Contract } from 'ethers'
import { AddressZero, MaxUint256 } from 'ethers/constants'
import { bigNumberify } from 'ethers/utils'
import { solidity, MockProvider, createFixtureLoader } from 'ethereum-waffle'

import { v2Fixture } from './shared/fixtures'
import { expandTo18Decimals, MINIMUM_LIQUIDITY } from './shared/utilities'

chai.use(solidity)

const overrides = {
  gasLimit: 9999999
}

describe('UniswapV2Migrator', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 9999999
  })
  const [wallet] = provider.getWallets()
  const loadFixture = createFixtureLoader(provider, [wallet])

  let WUSDCPartner: Contract
  let WUSDCPair: Contract
  let router: Contract
  let migrator: Contract
  let WUSDCExchangeV1: Contract
  beforeEach(async function() {
    const fixture = await loadFixture(v2Fixture)
    WUSDCPartner = fixture.WUSDCPartner
    WUSDCPair = fixture.WUSDCPair
    router = fixture.router01 // we used router01 for this contract
    migrator = fixture.migrator
    WUSDCExchangeV1 = fixture.WUSDCExchangeV1
  })

  it('migrate', async () => {
    const WUSDCPartnerAmount = expandTo18Decimals(1)
    const ETHAmount = expandTo18Decimals(4)
    await WUSDCPartner.approve(WUSDCExchangeV1.address, MaxUint256)
    await WUSDCExchangeV1.addLiquidity(bigNumberify(1), WUSDCPartnerAmount, MaxUint256, {
      ...overrides,
      value: ETHAmount
    })
    await WUSDCExchangeV1.approve(migrator.address, MaxUint256)
    const expectedLiquidity = expandTo18Decimals(2)
    const WUSDCPairToken0 = await WUSDCPair.token0()
    await expect(
      migrator.migrate(WUSDCPartner.address, WUSDCPartnerAmount, ETHAmount, wallet.address, MaxUint256, overrides)
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
})
