import { Cl } from "@stacks/transactions";
import { beforeEach, describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const sender = accounts.get("wallet_1")!;
const recipient = accounts.get("wallet_2")!;

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
});
