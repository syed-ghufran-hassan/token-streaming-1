;; Token Streaming Protocol
;; A protocol for continuous payment streams between two parties

;; Error codes
(define-constant ERR_UNAUTHORIZED (err u0))
(define-constant ERR_INVALID_SIGNATURE (err u1))
(define-constant ERR_STREAM_STILL_ACTIVE (err u2))
(define-constant ERR_INVALID_STREAM_ID (err u3))

;; Data variables
(define-data-var latest-stream-id uint u0)

;; Streams mapping - stores all payment streams
(define-map streams
  uint ;; stream-id
  {
    sender: principal,
    recipient: principal,
    balance: uint,
    withdrawn-balance: uint,
    payment-per-block: uint,
    timeframe: (tuple (start-block uint) (stop-block uint))
  }
)

;; Create a new stream
;; @param recipient: Who will receive the streamed tokens
;; @param initial-balance: Initial STX tokens to lock in the stream
;; @param timeframe: Block range during which stream is active
;; @param payment-per-block: STX tokens to unlock per block
(define-public (stream-to
    (recipient principal)
    (initial-balance uint)
    (timeframe (tuple (start-block uint) (stop-block uint)))
    (payment-per-block uint)
  )
  (let (
    (stream {
      sender: contract-caller,
      recipient: recipient,
      balance: initial-balance,
      withdrawn-balance: u0,
      payment-per-block: payment-per-block,
      timeframe: timeframe
    })
    (current-stream-id (var-get latest-stream-id))
  )
    ;; Transfer STX from sender to contract
    ;; as-contract gives us the contract's own address
    (try! (stx-transfer? initial-balance contract-caller (as-contract tx-sender)))
    
    ;; Store the stream
    (map-set streams current-stream-id stream)
    
    ;; Increment stream ID counter
    (var-set latest-stream-id (+ current-stream-id u1))
    
    ;; Return the new stream ID
    (ok current-stream-id)
  )
)

;; Refuel a stream with additional STX tokens
;; @param stream-id: ID of the stream to refuel
;; @param amount: Amount of STX tokens to add
(define-public (refuel
    (stream-id uint)
    (amount uint)
  )
  (let (
    (stream (unwrap! (map-get? streams stream-id) ERR_INVALID_STREAM_ID))
  )
    ;; Only sender can refuel their stream
    (asserts! (is-eq contract-caller (get sender stream)) ERR_UNAUTHORIZED)
    
    ;; Transfer tokens from sender to contract
    (try! (stx-transfer? amount contract-caller (as-contract tx-sender)))
    
    ;; Update stream balance
    (map-set streams stream-id 
      (merge stream {balance: (+ (get balance stream) amount)})
    )
    
    (ok amount)
  )
)

;; Calculate the number of blocks a stream has been active
;; @param timeframe: The start and stop block of the stream
;; @returns: Number of blocks that have passed
(define-read-only (calculate-block-delta
    (timeframe (tuple (start-block uint) (stop-block uint)))
  )
  (let (
    (start-block (get start-block timeframe))
    (stop-block (get stop-block timeframe))

    (delta 
      (if (<= block-height start-block)
        ;; Stream hasn't started yet
        u0
        ;; else
        (if (< block-height stop-block)
          ;; Stream is active
          (- block-height start-block)
          ;; else - Stream is over
          (- stop-block start-block)
        ) 
      )
    )
  )
    delta
  )
)

;; Check balance for a party involved in a stream
;; @param stream-id: ID of the stream
;; @param who: Address to check balance for
;; @returns: Withdrawable balance for the address
(define-read-only (balance-of
    (stream-id uint)
    (who principal)
  )
  (let (
    (stream (unwrap! (map-get? streams stream-id) u0))
    (block-delta (calculate-block-delta (get timeframe stream)))
    (recipient-balance (* block-delta (get payment-per-block stream)))
  )
    (if (is-eq who (get recipient stream))
      ;; Recipient's balance = accumulated - already withdrawn
      (- recipient-balance (get withdrawn-balance stream))
      (if (is-eq who (get sender stream))
        ;; Sender's balance = total balance - recipient's share
        (- (get balance stream) recipient-balance)
        ;; Not involved in stream
        u0
      )
    )
  )
)

;; Withdraw received tokens (recipient only)
;; @param stream-id: ID of the stream to withdraw from
(define-public (withdraw
    (stream-id uint)
  )
  (let (
    (stream (unwrap! (map-get? streams stream-id) ERR_INVALID_STREAM_ID))
    (balance (balance-of stream-id contract-caller))
  )
    ;; Only recipient can withdraw
    (asserts! (is-eq contract-caller (get recipient stream)) ERR_UNAUTHORIZED)
    
    ;; Update withdrawn balance
    (map-set streams stream-id 
      (merge stream {withdrawn-balance: (+ (get withdrawn-balance stream) balance)})
    )
    
    ;; Transfer tokens from contract to recipient
    (try! (as-contract (stx-transfer? balance tx-sender (get recipient stream))))
    
    (ok balance)
  )
)

;; Withdraw excess locked tokens (sender only, after stream ends)
;; @param stream-id: ID of the stream to refund from
(define-public (refund
    (stream-id uint)
  )
  (let (
    (stream (unwrap! (map-get? streams stream-id) ERR_INVALID_STREAM_ID))
    (balance (balance-of stream-id (get sender stream)))
  )
    ;; Only sender can refund
    (asserts! (is-eq contract-caller (get sender stream)) ERR_UNAUTHORIZED)
    
    ;; Stream must be over
    (asserts! (< (get stop-block (get timeframe stream)) block-height) ERR_STREAM_STILL_ACTIVE)
    
    ;; Update stream balance
    (map-set streams stream-id (merge stream {
        balance: (- (get balance stream) balance),
      }
    ))
    
    ;; Transfer excess tokens back to sender
    (try! (as-contract (stx-transfer? balance tx-sender (get sender stream))))
    
    (ok balance)
  )
)

;; Get hash of stream for signature verification
;; @param stream-id: ID of the stream
;; @param new-payment-per-block: New payment per block value
;; @param new-timeframe: New timeframe tuple
;; @returns: SHA-256 hash of the stream data
(define-read-only (hash-stream
    (stream-id uint)
    (new-payment-per-block uint)
    (new-timeframe (tuple (start-block uint) (stop-block uint)))
  )
  (let (
    (stream (unwrap! (map-get? streams stream-id) (sha256 0)))
    ;; Concatenate all data into a single buffer
    (msg (concat 
      (concat 
        (unwrap-panic (to-consensus-buff? stream)) 
        (unwrap-panic (to-consensus-buff? new-payment-per-block))
      ) 
      (unwrap-panic (to-consensus-buff? new-timeframe))
    ))
  )
    (sha256 msg)
  )
)

;; Signature verification
;; @param hash: The hash that was signed
;; @param signature: The signature to verify (65 bytes)
;; @param signer: Expected signer address
;; @returns: true if signature is valid, false otherwise
(define-read-only (validate-signature 
    (hash (buff 32)) 
    (signature (buff 65)) 
    (signer principal)
  )
  (is-eq 
    (principal-of? (unwrap! (secp256k1-recover? hash signature) false)) 
    (ok signer)
  )
)
