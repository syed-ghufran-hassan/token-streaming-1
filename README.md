# Stacks Token Streaming Protocol

A DeFi protocol for continuous payment streams between two parties, built with Clarity smart contracts on the Stacks blockchain.

## Overview

This protocol enables continuous payment streams where a sender can establish a stream to pay a recipient over time. The recipient can withdraw accumulated tokens at any point, and the sender can refuel the stream or reclaim excess tokens after completion.

## Features

- **Create Streams**: Establish a payment stream with customizable time periods and payment rates
- **Refuel Streams**: Add additional STX tokens to existing streams
- **Withdraw Tokens**: Recipients can claim accumulated tokens at any time
- **Refund Excess**: Senders can reclaim unused tokens after stream completion
- **Update Stream Details**: Both parties can consent to update payment terms via cryptographic signatures

## Development Journey (10 Commits)

This project was built progressively in 10 meaningful commits:

1. **Initialize project** - Set up basic error codes and data variables
2. **Add streams map** - Created storage structure for payment streams
3. **Implement stream-to** - Core function to create new streams
4. **Implement refuel** - Allow senders to add tokens to streams
5. **Add calculate-block-delta** - Helper to calculate elapsed blocks
6. **Add balance-of** - Helper to calculate withdrawable amounts
7. **Implement withdraw** - Enable recipients to claim tokens
8. **Implement refund** - Enable senders to reclaim excess tokens
9. **Add signature verification** - Helpers for secure updates
10. **Implement update-details** - Complete test suite and update functionality

## Project Structure

```
stacks-token-streaming/
├── contracts/
│   └── stream.clar          # Main streaming protocol contract
├── tests/
│   └── stream.test.ts       # Comprehensive test suite
├── settings/
│   └── Devnet.toml         # Development wallet configuration
├── deployments/
│   └── default.simnet-plan.yaml
└── package.json
```

## Smart Contract Functions

### Public Functions

- `stream-to` - Create a new payment stream
- `refuel` - Add tokens to an existing stream
- `withdraw` - Withdraw accumulated tokens (recipient only)
- `refund` - Reclaim excess tokens after stream ends (sender only)
- `update-details` - Update stream parameters with both parties' consent

### Read-Only Functions

- `calculate-block-delta` - Calculate how many blocks have passed
- `balance-of` - Check withdrawable balance for sender or recipient
- `hash-stream` - Generate hash for signature verification
- `validate-signature` - Verify cryptographic signatures

## Running Tests

```bash
# Install dependencies
npm install

# Run test suite
npm run test
```

All 8 tests should pass:
- ✓ Contract initialization and stream creation
- ✓ Stream refueling by sender
- ✓ Unauthorized refuel attempts blocked
- ✓ Recipient token withdrawal
- ✓ Unauthorized withdrawal blocked
- ✓ Sender excess token refund
- ✓ Signature verification
- ✓ Stream detail updates with consent

## Use Cases

1. **Freelance Work**: Clients can create streams to pay contractors over time
2. **Grants**: Organizations can distribute grant funds progressively
3. **Subscriptions**: Service providers can receive continuous payments
4. **Vesting**: Token vesting schedules with withdrawal flexibility

## Key Concepts

- **Block-based streaming**: Tokens unlock per Stacks block
- **Flexible withdrawals**: Recipients withdraw when convenient
- **Two-party consent**: Updates require signatures from both parties
- **Excess recovery**: Senders can reclaim unused tokens

## Security Features

- Authorization checks for all sensitive operations
- Signature verification for parameter updates
- Protection against replay attacks
- Stream state validation

## Built With

- [Clarity](https://docs.stacks.co/clarity) - Smart contract language
- [Clarinet](https://docs.hiro.so/clarinet) - Development toolkit
- [Vitest](https://vitest.dev/) - Testing framework
- [Stacks.js](https://github.com/hirosystems/stacks.js) - JavaScript SDK

## Learning Resource

This project is based on the [LearnWeb3 Stacks Tutorial](https://learnweb3.io/courses/introduction-to-stacks/project-build-a-token-streaming-protocol/)

## License

MIT
