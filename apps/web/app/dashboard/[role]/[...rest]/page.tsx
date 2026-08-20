import { PageHeader, EmptyState } from "@wishubest/ui";

export default async function CatchAllPage({ params }: { params: Promise<{ role: string; rest: string[] }> }) {
  const { role, rest } = await params;
  return (
    <div>
      <PageHeader title={rest.join(" / ")} subtitle={`${role} module`} />
      <EmptyState
        title="Under construction"
        description="This section is being built in a later milestone."
      />
    </div>
  );
}