
;; stackstake-contract
;; Automated staking pool contract for STX, handling reward distribution proportionally to stakers' contributions

;; constants
(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u100))
(define-constant err-insufficient-funds (err u101))
(define-constant err-no-stake-found (err u102))
(define-constant err-insufficient-stake (err u103))
(define-constant err-minimum-stake (err u104))
(define-constant err-zero-amount (err u105))
(define-constant err-no-stakers (err u106))
(define-constant min-stake-amount u1000000) ;; 1 STX in microSTX

;; data maps and vars
;; Map to track each staker's contribution
(define-map stakers 
  { staker: principal } 
  { 
    amount: uint,
    last-claim-height: uint
  }
)

;; Track total amount staked in the pool
(define-data-var total-staked uint u0)

;; Track total rewards distributed
(define-data-var total-rewards-distributed uint u0)

;; Track contract activation status
(define-data-var contract-active bool true)

;; private functions
;; Helper function to update staker data
(define-private (update-staker-data (staker principal) (amount uint) (operation (string-ascii 10)))
  (let ((current-data (default-to { amount: u0, last-claim-height: u0 } (map-get? stakers { staker: staker }))))
    (if (is-eq operation "add")
      (map-set stakers { staker: staker } 
        { 
          amount: (+ (get amount current-data) amount),
          last-claim-height: block-height
        })
      (if (is-eq operation "subtract")
        (let ((new-amount (- (get amount current-data) amount)))
          (if (is-eq new-amount u0)
            (map-delete stakers { staker: staker })
            (map-set stakers { staker: staker }
              {
                amount: new-amount,
                last-claim-height: (get last-claim-height current-data)
              })))
        false))))

;; public functions
;; Stake STX tokens in the pool
(define-public (stake (amount uint))
  (begin
    ;; Check if contract is active
    (asserts! (var-get contract-active) err-owner-only)
    ;; Check minimum stake amount
    (asserts! (>= amount min-stake-amount) err-minimum-stake)
    ;; Check if amount is greater than 0
    (asserts! (> amount u0) err-zero-amount)
    
    ;; Transfer STX from sender to contract
    (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))
    
    ;; Update staker data
    (update-staker-data tx-sender amount "add")
    
    ;; Update total staked amount
    (var-set total-staked (+ (var-get total-staked) amount))
    
    ;; Return success with staked amount
    (ok amount)))

;; Unstake STX tokens from the pool
(define-public (unstake (amount uint))
  (begin
    ;; Check if amount is greater than 0
    (asserts! (> amount u0) err-zero-amount)
    
    ;; Get current staker data
    (let ((staker-data (unwrap! (map-get? stakers { staker: tx-sender }) err-no-stake-found)))
      ;; Check if staker has enough staked
      (asserts! (>= (get amount staker-data) amount) err-insufficient-stake)
      
      ;; Update staker data
      (update-staker-data tx-sender amount "subtract")
      
      ;; Update total staked amount
      (var-set total-staked (- (var-get total-staked) amount))
      
      ;; Transfer STX from contract back to sender
      (try! (as-contract (stx-transfer? amount tx-sender tx-sender)))
      
      ;; Return success with unstaked amount
      (ok amount))))

;; Distribute rewards proportionally to all stakers
(define-public (distribute-rewards (total-reward uint))
  (begin
    ;; Check if caller is contract owner
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    ;; Check if total reward is greater than 0
    (asserts! (> total-reward u0) err-zero-amount)
    ;; Check if there are stakers
    (asserts! (> (var-get total-staked) u0) err-no-stakers)
    
    ;; Transfer reward amount to contract first
    (try! (stx-transfer? total-reward tx-sender (as-contract tx-sender)))
    
    ;; Update total rewards distributed
    (var-set total-rewards-distributed (+ (var-get total-rewards-distributed) total-reward))
    
    ;; Return success with distributed amount
    (ok total-reward)))

;; Helper function to calculate individual reward share
(define-private (calculate-reward-share (staker-amount uint) (total-reward uint))
  (/ (* staker-amount total-reward) (var-get total-staked)))

;; Claim rewards for a specific staker (can be called by anyone for any staker)
(define-public (claim-rewards (staker principal) (total-reward uint))
  (begin
    ;; Check if total reward is greater than 0
    (asserts! (> total-reward u0) err-zero-amount)
    ;; Check if there are stakers
    (asserts! (> (var-get total-staked) u0) err-no-stakers)
    
    ;; Get staker data
    (let ((staker-data (unwrap! (map-get? stakers { staker: staker }) err-no-stake-found)))
      ;; Calculate proportional reward
      (let ((staker-amount (get amount staker-data))
            (reward-share (calculate-reward-share staker-amount total-reward)))
        ;; Only transfer if reward share is greater than 0
        (if (> reward-share u0)
          (begin
            ;; Transfer reward to staker
            (try! (as-contract (stx-transfer? reward-share tx-sender staker)))
            ;; Update last claim height
            (map-set stakers { staker: staker }
              {
                amount: staker-amount,
                last-claim-height: block-height
              })
            ;; Return success with reward amount
            (ok reward-share))
          ;; Return 0 if no reward to claim
          (ok u0))))))

;; Batch claim rewards for multiple stakers
(define-public (batch-claim-rewards (stakers-list (list 50 principal)) (total-reward uint))
  (begin
    ;; Check if caller is contract owner
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    ;; Check if total reward is greater than 0
    (asserts! (> total-reward u0) err-zero-amount)
    ;; Check if there are stakers
    (asserts! (> (var-get total-staked) u0) err-no-stakers)
    
    ;; Process each staker in the list
    (let ((results (map claim-individual-reward stakers-list)))
      ;; Return success
      (ok total-reward))))

;; Helper function for batch claiming
(define-private (claim-individual-reward (staker principal))
  (match (map-get? stakers { staker: staker })
    staker-data
    (let ((reward-share (calculate-reward-share (get amount staker-data) u1000000))) ;; Use a base amount for calculation
      (if (> reward-share u0)
        (begin
          ;; This would be called within batch-claim-rewards context
          ;; Update last claim height
          (map-set stakers { staker: staker }
            {
              amount: (get amount staker-data),
              last-claim-height: block-height
            })
          reward-share)
        u0))
    u0))

;; Emergency function to toggle contract active status (owner only)
(define-public (toggle-contract-status)
  (begin
    ;; Check if caller is contract owner
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    
    ;; Toggle contract status
    (var-set contract-active (not (var-get contract-active)))
    
    ;; Return new status
    (ok (var-get contract-active))))
