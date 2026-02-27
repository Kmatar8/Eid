import ControllerClientPage from "./page-client"

type ControllerPageProps = {
  params: Promise<{ roomId: string }>
}

export default async function ControllerPage({ params }: ControllerPageProps) {
  const { roomId } = await params
  return <ControllerClientPage roomId={roomId} />
}
