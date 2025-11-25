pragma solidity =0.6.6;

import '../../core/contracts/interfaces/IArcFlowV25Factory.sol';
import '@uniswap/lib/contracts/libraries/TransferHelper.sol';

import './interfaces/IArcFlowV25LiquidityRouter.sol';
import './libraries/ArcFlowV25Library.sol';
import './libraries/SafeMath.sol';
import './interfaces/IERC20.sol';
import './interfaces/IWUSDC.sol';

contract ArcFlowV25LiquidityRouter is IArcFlowV25LiquidityRouter {
    using SafeMath for uint;

    address public immutable override factory;
    address public immutable override WUSDC;

    modifier ensure(uint deadline) {
        require(deadline >= block.timestamp, 'ArcFlowV25LiquidityRouter: EXPIRED');
        _;
    }

    constructor(address _factory, address _WUSDC) public {
        factory = _factory;
        WUSDC = _WUSDC;
    }

    receive() external payable {
        assert(msg.sender == WUSDC); // only accept USDC via fallback from the WUSDC contract
    }

    // **** ADD LIQUIDITY ****
    function _addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin
    ) internal virtual returns (uint amountA, uint amountB) {
        // create the pair if it doesn't exist yet
        if (IArcFlowV25Factory(factory).getPair(tokenA, tokenB) == address(0)) {
            IArcFlowV25Factory(factory).createPair(tokenA, tokenB);
        }
        (uint reserveA, uint reserveB) = ArcFlowV25Library.getReserves(factory, tokenA, tokenB);
        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint amountBOptimal = ArcFlowV25Library.quote(amountADesired, reserveA, reserveB);
            if (amountBOptimal <= amountBDesired) {
                require(amountBOptimal >= amountBMin, 'ArcFlowV25LiquidityRouter: INSUFFICIENT_B_AMOUNT');
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint amountAOptimal = ArcFlowV25Library.quote(amountBDesired, reserveB, reserveA);
                assert(amountAOptimal <= amountADesired);
                require(amountAOptimal >= amountAMin, 'ArcFlowV25LiquidityRouter: INSUFFICIENT_A_AMOUNT');
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) external virtual override ensure(deadline) returns (uint amountA, uint amountB, uint liquidity) {
        (amountA, amountB) = _addLiquidity(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin);
        address pair = ArcFlowV25Library.pairFor(factory, tokenA, tokenB);
        TransferHelper.safeTransferFrom(tokenA, msg.sender, pair, amountA);
        TransferHelper.safeTransferFrom(tokenB, msg.sender, pair, amountB);
        liquidity = IArcFlowV25Pair(pair).mint(to);
    }

    function addLiquidityUSDC(
        address token,
        uint amountTokenDesired,
        uint amountTokenMin,
        uint amountUSDCMin,
        address to,
        uint deadline
    ) external virtual override payable ensure(deadline) returns (uint amountToken, uint amountUSDC, uint liquidity) {
        (amountToken, amountUSDC) = _addLiquidity(
            token,
            WUSDC,
            amountTokenDesired,
            msg.value,
            amountTokenMin,
            amountUSDCMin
        );
        address pair = ArcFlowV25Library.pairFor(factory, token, WUSDC);
        TransferHelper.safeTransferFrom(token, msg.sender, pair, amountToken);
        IWUSDC(WUSDC).deposit{value: amountUSDC}();
        assert(IWUSDC(WUSDC).transfer(pair, amountUSDC));
        liquidity = IArcFlowV25Pair(pair).mint(to);
        // refund dust eth, if any
        if (msg.value > amountUSDC) TransferHelper.safeTransferUSDC(msg.sender, msg.value - amountUSDC);
    }

    // **** REMOVE LIQUIDITY ****
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint liquidity,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) public virtual override ensure(deadline) returns (uint amountA, uint amountB) {
        address pair = ArcFlowV25Library.pairFor(factory, tokenA, tokenB);
        IArcFlowV25Pair(pair).transferFrom(msg.sender, pair, liquidity); // send liquidity to pair
        (uint amount0, uint amount1) = IArcFlowV25Pair(pair).burn(to);
        (address token0,) = ArcFlowV25Library.sortTokens(tokenA, tokenB);
        (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
        require(amountA >= amountAMin, 'ArcFlowV25LiquidityRouter: INSUFFICIENT_A_AMOUNT');
        require(amountB >= amountBMin, 'ArcFlowV25LiquidityRouter: INSUFFICIENT_B_AMOUNT');
    }

    function removeLiquidityUSDC(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountUSDCMin,
        address to,
        uint deadline
    ) public virtual override ensure(deadline) returns (uint amountToken, uint amountUSDC) {
        (amountToken, amountUSDC) = removeLiquidity(
            token,
            WUSDC,
            liquidity,
            amountTokenMin,
            amountUSDCMin,
            address(this),
            deadline
        );
        TransferHelper.safeTransfer(token, to, amountToken);
        IWUSDC(WUSDC).withdraw(amountUSDC);
        TransferHelper.safeTransferUSDC(to, amountUSDC);
    }

    function removeLiquidityWithPermit(
        address tokenA,
        address tokenB,
        uint liquidity,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline,
        bool approveMax, uint8 v, bytes32 r, bytes32 s
    ) external virtual override returns (uint amountA, uint amountB) {
        address pair = ArcFlowV25Library.pairFor(factory, tokenA, tokenB);
        uint value = approveMax ? uint(-1) : liquidity;
        IArcFlowV25Pair(pair).permit(msg.sender, address(this), value, deadline, v, r, s);
        (amountA, amountB) = removeLiquidity(tokenA, tokenB, liquidity, amountAMin, amountBMin, to, deadline);
    }

    function removeLiquidityUSDCWithPermit(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountUSDCMin,
        address to,
        uint deadline,
        bool approveMax, uint8 v, bytes32 r, bytes32 s
    ) external virtual override returns (uint amountToken, uint amountUSDC) {
        address pair = ArcFlowV25Library.pairFor(factory, token, WUSDC);
        uint value = approveMax ? uint(-1) : liquidity;
        IArcFlowV25Pair(pair).permit(msg.sender, address(this), value, deadline, v, r, s);
        (amountToken, amountUSDC) = removeLiquidityUSDC(token, liquidity, amountTokenMin, amountUSDCMin, to, deadline);
    }

    function removeLiquidityUSDCSupportingFeeOnTransferTokens(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountUSDCMin,
        address to,
        uint deadline
    ) public virtual override ensure(deadline) returns (uint amountUSDC) {
        (, amountUSDC) = removeLiquidity(
            token,
            WUSDC,
            liquidity,
            amountTokenMin,
            amountUSDCMin,
            address(this),
            deadline
        );
        TransferHelper.safeTransfer(token, to, IERC20(token).balanceOf(address(this)));
        IWUSDC(WUSDC).withdraw(amountUSDC);
        TransferHelper.safeTransferUSDC(to, amountUSDC);
    }

    function removeLiquidityUSDCWithPermitSupportingFeeOnTransferTokens(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountUSDCMin,
        address to,
        uint deadline,
        bool approveMax, uint8 v, bytes32 r, bytes32 s
    ) external virtual override returns (uint amountUSDC) {
        address pair = ArcFlowV25Library.pairFor(factory, token, WUSDC);
        uint value = approveMax ? uint(-1) : liquidity;
        IArcFlowV25Pair(pair).permit(msg.sender, address(this), value, deadline, v, r, s);
        amountUSDC = removeLiquidityUSDCSupportingFeeOnTransferTokens(
            token, liquidity, amountTokenMin, amountUSDCMin, to, deadline
        );
    }

    // **** LIBRARY FUNCTIONS ****
    function quote(uint amountA, uint reserveA, uint reserveB) public pure virtual override returns (uint amountB) {
        return ArcFlowV25Library.quote(amountA, reserveA, reserveB);
    }
}
