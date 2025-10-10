import { Cl } from "@stacks/transactions";
import { beforeEach, describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const sender = accounts.get("wallet_1")!;
const recipient = accounts.get("wallet_2")!;
const randomUser = accounts.get("wallet_3")!;

describe("test token streaming contract", () => {
  beforeEach(() => {
    const result = simnet.callPublicFn(
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

    expect(result.events[0].event).toBe("stx_transfer_event");
    expect(result.events[0].data.amount).toBe("5");
    expect(result.events[0].data.sender).toBe(sender);
  });

  it("ensures contract is initialized properly and stream is created", () => {
    const latestStreamId = simnet.getDataVar("stream", "latest-stream-id");
    expect(latestStreamId).toBeUint(1);

    const createdStream = simnet.getMapEntry("stream", "streams", Cl.uint(0));
    expect(createdStream).toBeSome(
      Cl.tuple({
        sender: Cl.principal(sender),
        recipient: Cl.principal(recipient),
        balance: Cl.uint(5),
        "withdrawn-balance": Cl.uint(0),
        "payment-per-block": Cl.uint(1),
        timeframe: Cl.tuple({
          "start-block": Cl.uint(0),
          "stop-block": Cl.uint(5),
        }),
      })
    );
  });

  it("ensures stream can be refueled", () => {
    const result = simnet.callPublicFn(
      "stream",
      "refuel",
      [Cl.uint(0), Cl.uint(5)],
      sender
    );

    expect(result.events[0].event).toBe("stx_transfer_event");
    expect(result.events[0].data.amount).toBe("5");
    expect(result.events[0].data.sender).toBe(sender);

    const createdStream = simnet.getMapEntry("stream", "streams", Cl.uint(0));
    expect(createdStream).toBeSome(
      Cl.tuple({
        sender: Cl.principal(sender),
        recipient: Cl.principal(recipient),
        balance: Cl.uint(10),
        "withdrawn-balance": Cl.uint(0),
        "payment-per-block": Cl.uint(1),
        timeframe: Cl.tuple({
          "start-block": Cl.uint(0),
          "stop-block": Cl.uint(5),
        }),
      })
    );
  });

  it("ensures stream cannot be refueled by random address", () => {
    const result = simnet.callPublicFn(
      "stream",
      "refuel",
      [Cl.uint(0), Cl.uint(5)],
      randomUser
    );

    expect(result.result).toBeErr(Cl.uint(0));
  });

  it("ensures recipient can withdraw tokens over time", () => {
    // Block 1 was used to deploy contract
    // Block 2 was used to create stream
    // `withdraw` will be called in Block 3
    // so expected to withdraw (Block 3 - Start_Block) = (3 - 0) tokens
    const withdraw = simnet.callPublicFn(
      "stream",
      "withdraw",
      [Cl.uint(0)],
      recipient
    );

    expect(withdraw.events[0].event).toBe("stx_transfer_event");
    expect(withdraw.events[0].data.amount).toBe("3");
    expect(withdraw.events[0].data.recipient).toBe(recipient);
  });

  it("ensures non-recipient cannot withdraw tokens from stream", () => {
    const withdraw = simnet.callPublicFn(
      "stream",
      "withdraw",
      [Cl.uint(0)],
      randomUser
    );

    expect(withdraw.result).toBeErr(Cl.uint(0));
  });
});
