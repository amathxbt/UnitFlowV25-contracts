pragma solidity =0.6.6;

import '../../core/contracts/interfaces/IArcFlowV25Factory.sol';
import './libraries/TransferHelper.sol';

import './interfaces/IArcFlowV25SwapRouter.sol';
import './libraries/ArcFlowV25Library.sol';
import './libraries/SafeMath.sol';
import './interfaces/IERC20.sol';
import './interfaces/IWUSDC.sol';

contract ArcFlowV25SwapRouter is IArcFlowV25SwapRouter {
    using SafeMath for uint;

    address public immutable override factory;
    address public immutable override WUSDC;

    modifier ensure(uint deadline) {
        require(deadline >= block.timestamp, 'ArcFlowV25SwapRouter: EXPIRED');
        _;
    }

    constructor(address _factory, address _WUSDC) public {
        factory = _factory;
        WUSDC = _WUSDC;
    }

    receive() external payable {
        assert(msg.sender == WUSDC); // only accept USDC via fallback from the WUSDC contract
    }

    // **** SWAP ****
    // requires the initial amount to have already been sent to the first pair
    function _swap(uint[] memory amounts, address[] memory path, address _to) internal virtual {
        for (uint i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0,) = ArcFlowV25Library.sortTokens(input, output);
            uint amountOut = amounts[i + 1];
            (uint amount0Out, uint amount1Out) = input == token0 ? (uint(0), amountOut) : (amountOut, uint(0));
            address to = i < path.length - 2 ? ArcFlowV25Library.pairFor(factory, output, path[i + 2]) : _to;
            IArcFlowV25Pair(ArcFlowV25Library.pairFor(factory, input, output)).swap(
                amount0Out, amount1Out, to, new bytes(0)
            );
        }
    }

    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external virtual override ensure(deadline) returns (uint[] memory amounts) {
        amounts = ArcFlowV25Library.getAmountsOut(factory, amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, 'ArcFlowV25SwapRouter: INSUFFICIENT_OUTPUT_AMOUNT');
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, ArcFlowV25Library.pairFor(factory, path[0], path[1]), amounts[0]
        );
        _swap(amounts, path, to);
    }

    function swapTokensForExactTokens(
        uint amountOut,
        uint amountInMax,
        address[] calldata path,
        address to,
        uint deadline
    ) external virtual override ensure(deadline) returns (uint[] memory amounts) {
        amounts = ArcFlowV25Library.getAmountsIn(factory, amountOut, path);
        require(amounts[0] <= amountInMax, 'ArcFlowV25SwapRouter: EXCESSIVE_INPUT_AMOUNT');
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, ArcFlowV25Library.pairFor(factory, path[0], path[1]), amounts[0]
        );
        _swap(amounts, path, to);
    }

    function swapExactUSDCForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline)
        external
        virtual
        override
        payable
        ensure(deadline)
        returns (uint[] memory amounts)
    {
        require(path[0] == WUSDC, 'ArcFlowV25SwapRouter: INVALID_PATH');
        amounts = ArcFlowV25Library.getAmountsOut(factory, msg.value, path);
        require(amounts[amounts.length - 1] >= amountOutMin, 'ArcFlowV25SwapRouter: INSUFFICIENT_OUTPUT_AMOUNT');
        IWUSDC(WUSDC).deposit{value: amounts[0]}();
        assert(IWUSDC(WUSDC).transfer(ArcFlowV25Library.pairFor(factory, path[0], path[1]), amounts[0]));
        _swap(amounts, path, to);
    }

    function swapTokensForExactUSDC(uint amountOut, uint amountInMax, address[] calldata path, address to, uint deadline)
        external
        virtual
        override
        ensure(deadline)
        returns (uint[] memory amounts)
    {
        require(path[path.length - 1] == WUSDC, 'ArcFlowV25SwapRouter: INVALID_PATH');
        amounts = ArcFlowV25Library.getAmountsIn(factory, amountOut, path);
        require(amounts[0] <= amountInMax, 'ArcFlowV25SwapRouter: EXCESSIVE_INPUT_AMOUNT');
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, ArcFlowV25Library.pairFor(factory, path[0], path[1]), amounts[0]
        );
        _swap(amounts, path, address(this));
        IWUSDC(WUSDC).withdraw(amounts[amounts.length - 1]);
        TransferHelper.safeTransferUSDC(to, amounts[amounts.length - 1]);
    }

    function swapExactTokensForUSDC(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline)
        external
        virtual
        override
        ensure(deadline)
        returns (uint[] memory amounts)
    {
        require(path[path.length - 1] == WUSDC, 'ArcFlowV25SwapRouter: INVALID_PATH');
        amounts = ArcFlowV25Library.getAmountsOut(factory, amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, 'ArcFlowV25SwapRouter: INSUFFICIENT_OUTPUT_AMOUNT');
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, ArcFlowV25Library.pairFor(factory, path[0], path[1]), amounts[0]
        );
        _swap(amounts, path, address(this));
        IWUSDC(WUSDC).withdraw(amounts[amounts.length - 1]);
        TransferHelper.safeTransferUSDC(to, amounts[amounts.length - 1]);
    }

    function swapUSDCForExactTokens(uint amountOut, address[] calldata path, address to, uint deadline)
        external
        virtual
        override
        payable
        ensure(deadline)
        returns (uint[] memory amounts)
    {
        require(path[0] == WUSDC, 'ArcFlowV25SwapRouter: INVALID_PATH');
        amounts = ArcFlowV25Library.getAmountsIn(factory, amountOut, path);
        require(amounts[0] <= msg.value, 'ArcFlowV25SwapRouter: EXCESSIVE_INPUT_AMOUNT');
        IWUSDC(WUSDC).deposit{value: amounts[0]}();
        assert(IWUSDC(WUSDC).transfer(ArcFlowV25Library.pairFor(factory, path[0], path[1]), amounts[0]));
        _swap(amounts, path, to);
        // refund dust eth, if any
        if (msg.value > amounts[0]) TransferHelper.safeTransferUSDC(msg.sender, msg.value - amounts[0]);
    }

    // **** SWAP (supporting fee-on-transfer tokens) ****
    // requires the initial amount to have already been sent to the first pair
    function _swapSupportingFeeOnTransferTokens(address[] memory path, address _to) internal virtual {
        for (uint i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0,) = ArcFlowV25Library.sortTokens(input, output);
            IArcFlowV25Pair pair = IArcFlowV25Pair(ArcFlowV25Library.pairFor(factory, input, output));
            uint amountInput;
            uint amountOutput;
            { // scope to avoid stack too deep errors
            (uint reserve0, uint reserve1,) = pair.getReserves();
            (uint reserveInput, uint reserveOutput) = input == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
            amountInput = IERC20(input).balanceOf(address(pair)).sub(reserveInput);
            amountOutput = ArcFlowV25Library.getAmountOut(amountInput, reserveInput, reserveOutput);
            }
            (uint amount0Out, uint amount1Out) = input == token0 ? (uint(0), amountOutput) : (amountOutput, uint(0));
            address to = i < path.length - 2 ? ArcFlowV25Library.pairFor(factory, output, path[i + 2]) : _to;
            pair.swap(amount0Out, amount1Out, to, new bytes(0));
        }
    }

    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external virtual override ensure(deadline) {
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, ArcFlowV25Library.pairFor(factory, path[0], path[1]), amountIn
        );
        uint balanceBefore = IERC20(path[path.length - 1]).balanceOf(to);
        _swapSupportingFeeOnTransferTokens(path, to);
        require(
            IERC20(path[path.length - 1]).balanceOf(to).sub(balanceBefore) >= amountOutMin,
            'ArcFlowV25SwapRouter: INSUFFICIENT_OUTPUT_AMOUNT'
        );
    }

    function swapExactUSDCForTokensSupportingFeeOnTransferTokens(
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    )
        external
        virtual
        override
        payable
        ensure(deadline)
    {
        require(path[0] == WUSDC, 'ArcFlowV25SwapRouter: INVALID_PATH');
        uint amountIn = msg.value;
        IWUSDC(WUSDC).deposit{value: amountIn}();
        assert(IWUSDC(WUSDC).transfer(ArcFlowV25Library.pairFor(factory, path[0], path[1]), amountIn));
        uint balanceBefore = IERC20(path[path.length - 1]).balanceOf(to);
        _swapSupportingFeeOnTransferTokens(path, to);
        require(
            IERC20(path[path.length - 1]).balanceOf(to).sub(balanceBefore) >= amountOutMin,
            'ArcFlowV25SwapRouter: INSUFFICIENT_OUTPUT_AMOUNT'
        );
    }

    function swapExactTokensForUSDCSupportingFeeOnTransferTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    )
        external
        virtual
        override
        ensure(deadline)
    {
        require(path[path.length - 1] == WUSDC, 'ArcFlowV25SwapRouter: INVALID_PATH');
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, ArcFlowV25Library.pairFor(factory, path[0], path[1]), amountIn
        );
        // Record balance before swap to calculate only the amount received from this swap,
        // preventing drain of any pre-existing WUSDC balance held by the router.
        uint balanceBefore = IERC20(WUSDC).balanceOf(address(this));
        _swapSupportingFeeOnTransferTokens(path, address(this));
        uint amountOut = IERC20(WUSDC).balanceOf(address(this)).sub(balanceBefore);
        require(amountOut >= amountOutMin, 'ArcFlowV25SwapRouter: INSUFFICIENT_OUTPUT_AMOUNT');
        IWUSDC(WUSDC).withdraw(amountOut);
        TransferHelper.safeTransferUSDC(to, amountOut);
    }

    // **** LIBRARY FUNCTIONS ****
    function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut)
        public
        pure
        virtual
        override
        returns (uint amountOut)
    {
        return ArcFlowV25Library.getAmountOut(amountIn, reserveIn, reserveOut);
    }

    function getAmountIn(uint amountOut, uint reserveIn, uint reserveOut)
        public
        pure
        virtual
        override
        returns (uint amountIn)
    {
        return ArcFlowV25Library.getAmountIn(amountOut, reserveIn, reserveOut);
    }

    function getAmountsOut(uint amountIn, address[] memory path)
        public
        view
        virtual
        override
        returns (uint[] memory amounts)
    {
        return ArcFlowV25Library.getAmountsOut(factory, amountIn, path);
    }

    function getAmountsIn(uint amountOut, address[] memory path)
        public
        view
        virtual
        override
        returns (uint[] memory amounts)
    {
        return ArcFlowV25Library.getAmountsIn(factory, amountOut, path);
    }
}
