import { ReviewQueuePage } from '@/app/dashboard/review-queue-page'

export const revalidate = 0

export default async function ReviewQueueRoute({
  searchParams,
}: {
  searchParams?: { status?: string; persona?: string; tab?: string; mock?: string }
}) {
  return <ReviewQueuePage searchParams={searchParams} routeBase="/review_queue" />
}
