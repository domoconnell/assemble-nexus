import { redirect } from "next/navigation";

export default function LedgerIndex() {
	redirect("/admin/ledger/overview");
}
