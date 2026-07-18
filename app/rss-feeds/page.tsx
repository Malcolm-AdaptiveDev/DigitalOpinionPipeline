import { RssFeedsPage } from "./feeds-page";

export const revalidate = 0;

export default async function RssFeedsRoute({
  searchParams,
}: {
  searchParams?: { mock?: string };
}) {
  return <RssFeedsPage searchParams={searchParams} />;
}
