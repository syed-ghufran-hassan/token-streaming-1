;; Token Streaming Protocol
;; A protocol for continuous payment streams between two parties

;; Error codes
(define-constant ERR_UNAUTHORIZED (err u0))
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
