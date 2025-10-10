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
