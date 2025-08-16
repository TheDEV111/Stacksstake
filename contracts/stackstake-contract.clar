
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
;;

;; public functions
;;
