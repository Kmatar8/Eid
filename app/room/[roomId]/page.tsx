import RoomDisplayClientPage from "./page-client"

type RoomDisplayPageProps = {
  params: Promise<{ roomId: string }>
}

export default async function RoomDisplayPage({ params }: RoomDisplayPageProps) {
  const { roomId } = await params
  return <RoomDisplayClientPage roomId={roomId} />
}
