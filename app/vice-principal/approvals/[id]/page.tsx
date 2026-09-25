import ApprovalDetailPage from "@/components/results/ApprovalDetailPage";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ApprovalDetailPage resultId={id} basePath="/vice-principal" />;
}
