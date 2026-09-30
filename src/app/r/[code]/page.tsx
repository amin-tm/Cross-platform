import SharedTransfer from "@/components/shared-transfer";

export default async function ReceivePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <SharedTransfer code={code} />;
}
