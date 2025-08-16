
import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v0.14.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

Clarinet.test({
    name: "Can stake STX tokens successfully",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;
        
        let block = chain.mineBlock([
            Tx.contractCall('stackstake-contract', 'stake', [types.uint(1000000)], wallet1.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), types.uint(1000000));
        
        // Check staker info
        let getStakerInfo = chain.callReadOnlyFn(
            'stackstake-contract',
            'get-staker-info',
            [types.principal(wallet1.address)],
            deployer.address
        );
        
        const stakerData = getStakerInfo.result.expectSome().expectTuple();
        assertEquals(stakerData['amount'], types.uint(1000000));
    },
});

Clarinet.test({
    name: "Can unstake STX tokens successfully",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;
        
        let block = chain.mineBlock([
            Tx.contractCall('stackstake-contract', 'stake', [types.uint(2000000)], wallet1.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), types.uint(2000000));
        
        // Unstake half
        block = chain.mineBlock([
            Tx.contractCall('stackstake-contract', 'unstake', [types.uint(1000000)], wallet1.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), types.uint(1000000));
        
        // Check remaining stake
        let getStakerInfo = chain.callReadOnlyFn(
            'stackstake-contract',
            'get-staker-info',
            [types.principal(wallet1.address)],
            deployer.address
        );
        
        const stakerData = getStakerInfo.result.expectSome().expectTuple();
        assertEquals(stakerData['amount'], types.uint(1000000));
    },
});

Clarinet.test({
    name: "Cannot stake below minimum amount",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const wallet1 = accounts.get('wallet_1')!;
        
        let block = chain.mineBlock([
            Tx.contractCall('stackstake-contract', 'stake', [types.uint(500000)], wallet1.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.uint(104)); // err-minimum-stake
    },
});

Clarinet.test({
    name: "Cannot unstake more than staked amount",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const wallet1 = accounts.get('wallet_1')!;
        
        let block = chain.mineBlock([
            Tx.contractCall('stackstake-contract', 'stake', [types.uint(1000000)], wallet1.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), types.uint(1000000));
        
        // Try to unstake more than staked
        block = chain.mineBlock([
            Tx.contractCall('stackstake-contract', 'unstake', [types.uint(2000000)], wallet1.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.uint(103)); // err-insufficient-stake
    },
});

Clarinet.test({
    name: "Can distribute and claim rewards proportionally",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;
        const wallet2 = accounts.get('wallet_2')!;
        
        // Stake different amounts
        let block = chain.mineBlock([
            Tx.contractCall('stackstake-contract', 'stake', [types.uint(3000000)], wallet1.address), // 3 STX
            Tx.contractCall('stackstake-contract', 'stake', [types.uint(1000000)], wallet2.address)  // 1 STX
        ]);
        
        assertEquals(block.receipts.length, 2);
        assertEquals(block.receipts[0].result.expectOk(), types.uint(3000000));
        assertEquals(block.receipts[1].result.expectOk(), types.uint(1000000));
        
        // Distribute rewards (4 STX total)
        block = chain.mineBlock([
            Tx.contractCall('stackstake-contract', 'distribute-rewards', [types.uint(4000000)], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), types.uint(4000000));
        
        // Check potential rewards
        let wallet1Reward = chain.callReadOnlyFn(
            'stackstake-contract',
            'calculate-staker-reward',
            [types.principal(wallet1.address), types.uint(4000000)],
            deployer.address
        );
        
        let wallet2Reward = chain.callReadOnlyFn(
            'stackstake-contract',
            'calculate-staker-reward',
            [types.principal(wallet2.address), types.uint(4000000)],
            deployer.address
        );
        
        // wallet1 should get 3/4 = 3 STX, wallet2 should get 1/4 = 1 STX
        assertEquals(wallet1Reward.result.expectSome(), types.uint(3000000));
        assertEquals(wallet2Reward.result.expectSome(), types.uint(1000000));
    },
});

Clarinet.test({
    name: "Read-only functions work correctly",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;
        
        // Initial state checks
        let totalStaked = chain.callReadOnlyFn(
            'stackstake-contract',
            'get-total-staked',
            [],
            deployer.address
        );
        assertEquals(totalStaked.result, types.uint(0));
        
        let isActive = chain.callReadOnlyFn(
            'stackstake-contract',
            'get-contract-status',
            [],
            deployer.address
        );
        assertEquals(isActive.result, types.bool(true));
        
        let minStake = chain.callReadOnlyFn(
            'stackstake-contract',
            'get-min-stake-amount',
            [],
            deployer.address
        );
        assertEquals(minStake.result, types.uint(1000000));
        
        // Stake and check again
        let block = chain.mineBlock([
            Tx.contractCall('stackstake-contract', 'stake', [types.uint(2000000)], wallet1.address)
        ]);
        
        totalStaked = chain.callReadOnlyFn(
            'stackstake-contract',
            'get-total-staked',
            [],
            deployer.address
        );
        assertEquals(totalStaked.result, types.uint(2000000));
        
        let isStaker = chain.callReadOnlyFn(
            'stackstake-contract',
            'is-staker',
            [types.principal(wallet1.address)],
            deployer.address
        );
        assertEquals(isStaker.result, types.bool(true));
        
        let stakerPercentage = chain.callReadOnlyFn(
            'stackstake-contract',
            'get-staker-percentage',
            [types.principal(wallet1.address)],
            deployer.address
        );
        assertEquals(stakerPercentage.result.expectSome(), types.uint(10000)); // 100% = 10000
    },
});

Clarinet.test({
    name: "Only owner can toggle contract status",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;
        
        // Non-owner cannot toggle
        let block = chain.mineBlock([
            Tx.contractCall('stackstake-contract', 'toggle-contract-status', [], wallet1.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.uint(100)); // err-owner-only
        
        // Owner can toggle
        block = chain.mineBlock([
            Tx.contractCall('stackstake-contract', 'toggle-contract-status', [], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), types.bool(false));
        
        // Check contract is now inactive
        let isActive = chain.callReadOnlyFn(
            'stackstake-contract',
            'get-contract-status',
            [],
            deployer.address
        );
        assertEquals(isActive.result, types.bool(false));
    },
});
