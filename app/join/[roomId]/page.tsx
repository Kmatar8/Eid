import JoinRoomClientPage from "./page-client"

type JoinRoomPageProps = {
  params: Promise<{ roomId: string }>
}

export default async function JoinRoomPage({ params }: JoinRoomPageProps) {
  const { roomId } = await params
  return <JoinRoomClientPage roomId={roomId} />
}
