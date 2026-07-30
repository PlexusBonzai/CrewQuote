import type { Database } from "../../types/database.types";
import type { CrewPayment } from "../crewquoteTypes";

type Row = Database["public"]["Tables"]["payments"]["Row"];
type Insert = Database["public"]["Tables"]["payments"]["Insert"];
type Update = Database["public"]["Tables"]["payments"]["Update"];

const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

export function paymentRowToModel(row: Row): CrewPayment {
  return { id: row.legacy_id || row.id, paymentDate: row.payment_date, amount: n(row.amount), method: row.method, reference: row.reference, notes: row.notes };
}

export function paymentModelToInsert(payment: CrewPayment, userId: string, invoiceUuid: string): Insert {
  return { user_id: userId, invoice_id: invoiceUuid, legacy_id: payment.id, payment_date: payment.paymentDate, amount: n(payment.amount), method: payment.method || "", reference: payment.reference || "", notes: payment.notes || "" };
}

export function paymentModelToUpdate(payment: CrewPayment, invoiceUuid: string): Update {
  const { user_id, ...update } = paymentModelToInsert(payment, "00000000-0000-0000-0000-000000000000", invoiceUuid);
  void user_id;
  return update;
}
