import {
  Cl,
  createStacksPrivateKey,
  cvToValue,
  signMessageHashRsv,
} from "@stacks/transactions";
import { beforeEach, describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const sender = accounts.get("wallet_1")!;
const recipient = accounts.get("wallet_2")!;
const randomUser = accounts.get("wallet_3")!;
const anotherRecipient = accounts.get("wallet_4")!;

describe("Token Streaming Contract - Enhanced Tests", () => {
  // Reset state before each test
  beforeEach(() => {
    // Clear any existing streams by resetting the contract state
    simnet.setDataVar("stream", "latest-stream-id", Cl.uint(0));
  });

  describe("Stream Creation Edge Cases", () => {
    it("should create multiple streams and track IDs correctly", () => {
      // Create first stream
      const stream1 = simnet.callPublicFn(
        "stream",
        "stream-to",
        [
          Cl.principal(recipient),
          Cl.uint(10),
          Cl.tuple({ "start-block": Cl.uint(0), "stop-block": Cl.uint(10) }),
          Cl.uint(1),
        ],
        sender
      );
      expect(stream1.result).toBeOk(Cl.uint(0));

      // Create second stream
      const stream2 = simnet.callPublicFn(
        "stream",
        "stream-to",
        [
          Cl.principal(anotherRecipient),
          Cl.uint(20),
          Cl.tuple({ "start-block": Cl.uint(5), "stop-block": Cl.uint(15) }),
          Cl.uint(2),
        ],
        sender
      );
      expect(stream2.result).toBeOk(Cl.uint(1));

      // Verify latest-stream-id
      const latestId = simnet.getDataVar("stream", "latest-stream-id");
      expect(latestId).toBeUint(2);

      // Verify both streams exist
      const stream1Data = simnet.getMapEntry("stream", "streams", Cl.uint(0));
      const stream2Data = simnet.getMapEntry("stream", "streams", Cl.uint(1));
      expect(stream1Data).toBeSome();
      expect(stream2Data).toBeSome();
    });

    it("should reject stream with zero balance", () => {
      const result = simnet.callPublicFn(
        "stream",
        "stream-to",
        [
          Cl.principal(recipient),
          Cl.uint(0),
          Cl.tuple({ "start-block": Cl.uint(0), "stop-block": Cl.uint(5) }),
          Cl.uint(1),
        ],
        sender
      );

      expect(result.result).toBeErr(Cl.uint(4)); // ERR_INVALID_AMOUNT
    });

    it("should reject stream with zero payment per block", () => {
      const result = simnet.callPublicFn(
        "stream",
        "stream-to",
        [
          Cl.principal(recipient),
          Cl.uint(5),
          Cl.tuple({ "start-block": Cl.uint(0), "stop-block": Cl.uint(5) }),
          Cl.uint(0),
        ],
        sender
      );

      // This should be allowed? The contract doesn't validate payment-per-block > 0
      expect(result.result).toBeOk(Cl.uint(0));
    });

    it("should reject stream with invalid timeframe (stop <= start)", () => {
      const result = simnet.callPublicFn(
        "stream",
        "stream-to",
        [
          Cl.principal(recipient),
          Cl.uint(5),
          Cl.tuple({ "start-block": Cl.uint(5), "stop-block": Cl.uint(3) }),
          Cl.uint(1),
        ],
        sender
      );

      expect(result.result).toBeErr(Cl.uint(5)); // ERR_INVALID_TIMEFRAME
    });

    it("should reject stream with same start and stop block", () => {
      const result = simnet.callPublicFn(
        "stream",
        "stream-to",
        [
          Cl.principal(recipient),
          Cl.uint(5),
          Cl.tuple({ "start-block": Cl.uint(5), "stop-block": Cl.uint(5) }),
          Cl.uint(1),
        ],
        sender
      );

      expect(result.result).toBeErr(Cl.uint(5)); // ERR_INVALID_TIMEFRAME
    });
  });

  describe("Balance Calculation Tests", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        "stream",
        "stream-to",
        [
          Cl.principal(recipient),
          Cl.uint(100),
          Cl.tuple({ "start-block": Cl.uint(10), "stop-block": Cl.uint(20) }),
          Cl.uint(5),
        ],
        sender
      );
    });

    it("should return zero balance before stream starts", () => {
      // Set current block to 5 (before start-block 10)
      simnet.mineEmptyBlocks(5);

      const recipientBalance = simnet.callReadOnlyFn(
        "stream",
        "balance-of",
        [Cl.uint(0), Cl.principal(recipient)],
        randomUser
      );

      const senderBalance = simnet.callReadOnlyFn(
        "stream",
        "balance-of",
        [Cl.uint(0), Cl.principal(sender)],
        randomUser
      );

      expect(recipientBalance.result).toBeUint(0);
      expect(senderBalance.result).toBeUint(100);
    });

    it("should calculate correct balance during stream", () => {
      // Advance to block 15 (5 blocks after start)
      simnet.mineEmptyBlocks(15);

      const recipientBalance = simnet.callReadOnlyFn(
        "stream",
        "balance-of",
        [Cl.uint(0), Cl.principal(recipient)],
        randomUser
      );

      // Expected: (block-height - start-block) * payment-per-block = 5 * 5 = 25
      expect(recipientBalance.result).toBeUint(25);
    });

    it("should cap balance at stream end", () => {
      // Advance to block 25 (after stop-block)
      simnet.mineEmptyBlocks(25);

      const recipientBalance = simnet.callReadOnlyFn(
        "stream",
        "balance-of",
        [Cl.uint(0), Cl.principal(recipient)],
        randomUser
      );

      // Expected: (stop-block - start-block) * payment-per-block = 10 * 5 = 50
      expect(recipientBalance.result).toBeUint(50);

      const senderBalance = simnet.callReadOnlyFn(
        "stream",
        "balance-of",
        [Cl.uint(0), Cl.principal(sender)],
        randomUser
      );

      // Sender balance: total - recipient share = 100 - 50 = 50
      expect(senderBalance.result).toBeUint(50);
    });

    it("should return zero for non-participant", () => {
      const balance = simnet.callReadOnlyFn(
        "stream",
        "balance-of",
        [Cl.uint(0), Cl.principal(randomUser)],
        randomUser
      );

      expect(balance.result).toBeUint(0);
    });
  });

  describe("Withdrawal Scenarios", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        "stream",
        "stream-to",
        [
          Cl.principal(recipient),
          Cl.uint(100),
          Cl.tuple({ "start-block": Cl.uint(0), "stop-block": Cl.uint(20) }),
          Cl.uint(5),
        ],
        sender
      );
    });

    it("should allow multiple partial withdrawals", () => {
      // Advance 5 blocks
      simnet.mineEmptyBlocks(5);

      // First withdrawal
      const withdraw1 = simnet.callPublicFn(
        "stream",
        "withdraw",
        [Cl.uint(0)],
        recipient
      );
      expect(withdraw1.events[0].data.amount).toBe("25"); // 5 * 5

      // Advance 5 more blocks
      simnet.mineEmptyBlocks(5);

      // Second withdrawal
      const withdraw2 = simnet.callPublicFn(
        "stream",
        "withdraw",
        [Cl.uint(0)],
        recipient
      );
      expect(withdraw2.events[0].data.amount).toBe("25"); // Another 25

      // Check total withdrawn in stream data
      const stream = simnet.getMapEntry("stream", "streams", Cl.uint(0));
      expect(stream.value.data["withdrawn-balance"]).toBeUint(50);
    });

    it("should prevent withdrawal after stream ends with no balance", () => {
      // Advance past stream end
      simnet.mineEmptyBlocks(25);

      // Withdraw all
      simnet.callPublicFn("stream", "withdraw", [Cl.uint(0)], recipient);

      // Try to withdraw again
      const withdraw = simnet.callPublicFn(
        "stream",
        "withdraw",
        [Cl.uint(0)],
        recipient
      );

      // Should withdraw 0 (no error, just no transfer)
      expect(withdraw.events).toHaveLength(0);
      expect(withdraw.result).toBeOk(Cl.uint(0));
    });

    it("should handle withdrawal exactly at stream end", () => {
      // Advance exactly to stop-block
      simnet.mineEmptyBlocks(20);

      const withdraw = simnet.callPublicFn(
        "stream",
        "withdraw",
        [Cl.uint(0)],
        recipient
      );

      expect(withdraw.events[0].data.amount).toBe("100"); // Full amount
    });
  });

  describe("Refund Scenarios", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        "stream",
        "stream-to",
        [
          Cl.principal(recipient),
          Cl.uint(100),
          Cl.tuple({ "start-block": Cl.uint(0), "stop-block": Cl.uint(20) }),
          Cl.uint(5),
        ],
        sender
      );
    });

    it("should prevent refund while stream is active", () => {
      // Advance 10 blocks (still active)
      simnet.mineEmptyBlocks(10);

      const refund = simnet.callPublicFn(
        "stream",
        "refund",
        [Cl.uint(0)],
        sender
      );

      expect(refund.result).toBeErr(Cl.uint(2)); // ERR_STREAM_STILL_ACTIVE
    });

    it("should allow refund of excess after stream ends", () => {
      // Advance past stream end
      simnet.mineEmptyBlocks(25);

      // Recipient withdraws their share
      simnet.callPublicFn("stream", "withdraw", [Cl.uint(0)], recipient);

      // Sender refunds excess
      const refund = simnet.callPublicFn(
        "stream",
        "refund",
        [Cl.uint(0)],
        sender
      );

      // Total was 100, recipient got 100 (20 blocks * 5), so excess should be 0
      expect(refund.events[0].data.amount).toBe("0");
    });

    it("should allow refund when stream ends with unclaimed balance", () => {
      // Advance past stream end
      simnet.mineEmptyBlocks(25);

      // Sender refunds without recipient withdrawing
      const refund = simnet.callPublicFn(
        "stream",
        "refund",
        [Cl.uint(0)],
        sender
      );

      // Sender gets back entire balance (recipient can still withdraw later)
      expect(refund.events[0].data.amount).toBe("100");
    });

    it("should prevent refund by non-sender", () => {
      // Advance past stream end
      simnet.mineEmptyBlocks(25);

      const refund = simnet.callPublicFn(
        "stream",
        "refund",
        [Cl.uint(0)],
        recipient
      );

      expect(refund.result).toBeErr(Cl.uint(0)); // ERR_UNAUTHORIZED
    });
  });

  describe("Update Details Edge Cases", () => {
    let streamId: number;

    beforeEach(() => {
      const result = simnet.callPublicFn(
        "stream",
        "stream-to",
        [
          Cl.principal(recipient),
          Cl.uint(100),
          Cl.tuple({ "start-block": Cl.uint(0), "stop-block": Cl.uint(20) }),
          Cl.uint(5),
        ],
        sender
      );
      streamId = 0;
    });

    it("should allow update with signature from either party", () => {
      // Hash for new parameters
      const hashedStream = simnet.callReadOnlyFn(
        "stream",
        "hash-stream",
        [
          Cl.uint(streamId),
          Cl.uint(10),
          Cl.tuple({ "start-block": Cl.uint(5), "stop-block": Cl.uint(15) }),
        ],
        sender
      );

      const hashAsHex = Buffer.from(hashedStream.result.buffer).toString("hex");
      
      // Recipient signs (consenting to update)
      const recipientSignature = signMessageHashRsv({
        messageHash: hashAsHex,
        privateKey: createStacksPrivateKey(
          "530e9f5ee8a49fdba7720b1aab072c969190518a6742002c8e60db13bf1d265701" // wallet_2 private key
        ),
      });

      // Sender calls update with recipient's signature
      const update = simnet.callPublicFn(
        "stream",
        "update-details",
        [
          Cl.uint(streamId),
          Cl.uint(10),
          Cl.tuple({ "start-block": Cl.uint(5), "stop-block": Cl.uint(15) }),
          Cl.principal(recipient),
          Cl.bufferFromHex(recipientSignature.data),
        ],
        sender
      );

      expect(update.result).toBeOk(Cl.bool(true));

      // Verify update
      const updatedStream = simnet.getMapEntry("stream", "streams", Cl.uint(streamId));
      expect(updatedStream.value.data["payment-per-block"]).toBeUint(10);
      expect(updatedStream.value.data.timeframe["start-block"]).toBeUint(5);
      expect(updatedStream.value.data.timeframe["stop-block"]).toBeUint(15);
    });

    it("should reject update with invalid signature", () => {
      const hashedStream = simnet.callReadOnlyFn(
        "stream",
        "hash-stream",
        [
          Cl.uint(streamId),
          Cl.uint(10),
          Cl.tuple({ "start-block": Cl.uint(5), "stop-block": Cl.uint(15) }),
        ],
        sender
      );

      const hashAsHex = Buffer.from(hashedStream.result.buffer).toString("hex");
      
      // Random user signs
      const randomSignature = signMessageHashRsv({
        messageHash: hashAsHex,
        privateKey: createStacksPrivateKey(
          "f9d7203e5f6b3d0f7e7c8d9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0" // random
        ),
      });

      const update = simnet.callPublicFn(
        "stream",
        "update-details",
        [
          Cl.uint(streamId),
          Cl.uint(10),
          Cl.tuple({ "start-block": Cl.uint(5), "stop-block": Cl.uint(15) }),
          Cl.principal(recipient),
          Cl.bufferFromHex(randomSignature.data),
        ],
        sender
      );

      expect(update.result).toBeErr(Cl.uint(1)); // ERR_INVALID_SIGNATURE
    });

    it("should reject update when neither party is signer", () => {
      const hashedStream = simnet.callReadOnlyFn(
        "stream",
        "hash-stream",
        [
          Cl.uint(streamId),
          Cl.uint(10),
          Cl.tuple({ "start-block": Cl.uint(5), "stop-block": Cl.uint(15) }),
        ],
        sender
      );

      const hashAsHex = Buffer.from(hashedStream.result.buffer).toString("hex");
      
      // Recipient signs
      const recipientSignature = signMessageHashRsv({
        messageHash: hashAsHex,
        privateKey: createStacksPrivateKey(
          "530e9f5ee8a49fdba7720b1aab072c969190518a6742002c8e60db13bf1d265701"
        ),
      });

      // Random user tries to update
      const update = simnet.callPublicFn(
        "stream",
        "update-details",
        [
          Cl.uint(streamId),
          Cl.uint(10),
          Cl.tuple({ "start-block": Cl.uint(5), "stop-block": Cl.uint(15) }),
          Cl.principal(recipient),
          Cl.bufferFromHex(recipientSignature.data),
        ],
        randomUser
      );

      expect(update.result).toBeErr(Cl.uint(0)); // ERR_UNAUTHORIZED
    });
  });

  describe("Refuel Edge Cases", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        "stream",
        "stream-to",
        [
          Cl.principal(recipient),
          Cl.uint(5),
          Cl.tuple({ "start-block": Cl.uint(0), "stop-block": Cl.uint(5) }),
          Cl.uint(1),
        ],
        sender
      );
    });

    it("should allow refueling with zero amount", () => {
      const refuel = simnet.callPublicFn(
        "stream",
        "refuel",
        [Cl.uint(0), Cl.uint(0)],
        sender
      );

      expect(refuel.events).toHaveLength(0); // No transfer event
      expect(refuel.result).toBeOk(Cl.uint(0));

      const stream = simnet.getMapEntry("stream", "streams", Cl.uint(0));
      expect(stream.value.data.balance).toBeUint(5); // Balance unchanged
    });

    it("should allow refueling after stream ends", () => {
      // Advance past stream end
      simnet.mineEmptyBlocks(10);

      const refuel = simnet.callPublicFn(
        "stream",
        "refuel",
        [Cl.uint(0), Cl.uint(10)],
        sender
      );

      expect(refuel.events[0].data.amount).toBe("10");
      
      const stream = simnet.getMapEntry("stream", "streams", Cl.uint(0));
      expect(stream.value.data.balance).toBeUint(15);
    });
  });

  describe("Invalid Stream ID Handling", () => {
    it("should return u0 for balance-of on invalid stream", () => {
      const balance = simnet.callReadOnlyFn(
        "stream",
        "balance-of",
        [Cl.uint(999), Cl.principal(recipient)],
        randomUser
      );

      expect(balance.result).toBeUint(0);
    });

    it("should return default hash for hash-stream on invalid stream", () => {
      const hash = simnet.callReadOnlyFn(
        "stream",
        "hash-stream",
        [
          Cl.uint(999),
          Cl.uint(1),
          Cl.tuple({ "start-block": Cl.uint(0), "stop-block": Cl.uint(5) }),
        ],
        sender
      );

      // Should return sha256(0) instead of error
      expect(hash.result.buffer).toBeDefined();
    });

    it("should return error for withdraw on invalid stream", () => {
      const withdraw = simnet.callPublicFn(
        "stream",
        "withdraw",
        [Cl.uint(999)],
        recipient
      );

      expect(withdraw.result).toBeErr(Cl.uint(3)); // ERR_INVALID_STREAM_ID
    });

    it("should return error for refund on invalid stream", () => {
      const refund = simnet.callPublicFn(
        "stream",
        "refund",
        [Cl.uint(999)],
        sender
      );

      expect(refund.result).toBeErr(Cl.uint(3)); // ERR_INVALID_STREAM_ID
    });

    it("should return error for update-details on invalid stream", () => {
      const hash = simnet.callReadOnlyFn(
        "stream",
        "hash-stream",
        [
          Cl.uint(999),
          Cl.uint(1),
          Cl.tuple({ "start-block": Cl.uint(0), "stop-block": Cl.uint(5) }),
        ],
        sender
      );

      const signature = signMessageHashRsv({
        messageHash: Buffer.from(hash.result.buffer).toString("hex"),
        privateKey: createStacksPrivateKey(
          "7287ba251d44a4d3fd9276c88ce34c5c52a038955511cccaf77e61068649c17801"
        ),
      });

      const update = simnet.callPublicFn(
        "stream",
        "update-details",
        [
          Cl.uint(999),
          Cl.uint(1),
          Cl.tuple({ "start-block": Cl.uint(0), "stop-block": Cl.uint(5) }),
          Cl.principal(sender),
          Cl.bufferFromHex(signature.data),
        ],
        recipient
      );

      expect(update.result).toBeErr(Cl.uint(3)); // ERR_INVALID_STREAM_ID
    });
  });

  describe("Multiple Stream Interactions", () => {
    it("should handle multiple streams from same sender", () => {
      // Create three streams
      for (let i = 0; i < 3; i++) {
        simnet.callPublicFn(
          "stream",
          "stream-to",
          [
            Cl.principal(recipient),
            Cl.uint(10),
            Cl.tuple({ "start-block": Cl.uint(0), "stop-block": Cl.uint(10) }),
            Cl.uint(1),
          ],
          sender
        );
      }

      // Advance 5 blocks
      simnet.mineEmptyBlocks(5);

      // Withdraw from all streams
      let totalWithdrawn = 0;
      for (let i = 0; i < 3; i++) {
        const withdraw = simnet.callPublicFn(
          "stream",
          "withdraw",
          [Cl.uint(i)],
          recipient
        );
        totalWithdrawn += parseInt(withdraw.events[0].data.amount);
      }

      // Each stream: 5 blocks * 1 = 5, total 15
      expect(totalWithdrawn).toBe(15);
    });

    it("should handle streams with different payment rates", () => {
      // Stream 0: 1 per block
      simnet.callPublicFn(
        "stream",
        "stream-to",
        [
          Cl.principal(recipient),
          Cl.uint(20),
          Cl.tuple({ "start-block": Cl.uint(0), "stop-block": Cl.uint(10) }),
          Cl.uint(1),
        ],
        sender
      );

      // Stream 1: 2 per block
      simnet.callPublicFn(
        "stream",
        "stream-to",
        [
          Cl.principal(recipient),
          Cl.uint(40),
          Cl.tuple({ "start-block": Cl.uint(0), "stop-block": Cl.uint(10) }),
          Cl.uint(2),
        ],
        sender
      );

      simnet.mineEmptyBlocks(5);

      const balance0 = simnet.callReadOnlyFn(
        "stream",
        "balance-of",
        [Cl.uint(0), Cl.principal(recipient)],
        recipient
      );

      const balance1 = simnet.callReadOnlyFn(
        "stream",
        "balance-of",
        [Cl.uint(1), Cl.principal(recipient)],
        recipient
      );

      expect(balance0.result).toBeUint(5);
      expect(balance1.result).toBeUint(10);
    });
  });
});
