import type { Metadata } from "next"

import ActivityMonitorPageClient from "./page-client"

export const metadata: Metadata = {
  title: "Activity Monitor | Hroof",
  description: "Read-only runtime activity monitor for active hosts, rooms, and controllers.",
}

export default function ActivityMonitorPage() {
  return <ActivityMonitorPageClient />
}

