import { redirect } from 'next/navigation';

export default async function ChatbotIdRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/workflows/${id}`);
}
