import { ReviewQueuePage } from './review-queue-page'

export const revalidate = 0

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { status?: string; persona?: string; tab?: string; mock?: string }
}) {
  return <ReviewQueuePage searchParams={searchParams} />
}
