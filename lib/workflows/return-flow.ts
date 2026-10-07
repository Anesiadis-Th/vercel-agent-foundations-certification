import { FatalError } from "workflow";
import {
  ApiRequestError,
  createReturn,
  getOrder,
  notifyReturnInProcess,
  preauthorizeRefund,
} from "@/lib/api";
import type { Order, Return } from "@/lib/types";

export async function returnFlow(orderId: string, reason: string) {
  "use workflow";

  const order = await getOrderStep(orderId);
  await preauthorizeRefundStep(orderId);
  const filed = await createReturnStep(order, reason);
  // Only tell the customer once the return actually exists.
  await notifyReturnInProcessStep(orderId);

  return { orderId, returnId: filed.id, status: filed.status };
}

// 4xx responses (bad order ID, invalid input, …) won't succeed on retry, so
// fail the run immediately. 429 and 5xx/network errors are left to retry.
function failFastOnClientError(err: unknown): never {
  if (
    err instanceof ApiRequestError &&
    err.status >= 400 &&
    err.status < 500 &&
    err.status !== 429
  ) {
    throw new FatalError(err.message);
  }
  throw err;
}

async function getOrderStep(orderId: string): Promise<Order> {
  "use step";
  try {
    return await getOrder(orderId);
  } catch (err) {
    failFastOnClientError(err);
  }
}

async function preauthorizeRefundStep(orderId: string): Promise<void> {
  "use step";
  try {
    await preauthorizeRefund(orderId);
  } catch (err) {
    failFastOnClientError(err);
  }
}

async function createReturnStep(order: Order, reason: string): Promise<Return> {
  "use step";
  try {
    return await createReturn({
      orderId: order.id,
      items: order.items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
      })),
      reason,
    });
  } catch (err) {
    failFastOnClientError(err);
  }
}

async function notifyReturnInProcessStep(orderId: string): Promise<void> {
  "use step";
  await notifyReturnInProcess(orderId);
}
