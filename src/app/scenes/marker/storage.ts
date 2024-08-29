import { Marker } from "@/protos/scene";
import globalStorage from "@/storage";
import { v4 } from "uuid";

export const markerStorage = globalStorage<Marker, Uint8Array>(
  "marker",
  (m) => Marker.encode(m).finish(),
  (b) => Marker.decode(b)
);


export async function cloneMarker(campaignId: string, markerId: string) {
  const marker = await markerStorage.storage.getItem(markerId);
  if (!marker) {
    throw new Error(`Marker with id ${markerId} not found`);
  }
  
  const decodedMarker = Marker.decode(marker);
  decodedMarker.id = `${campaignId}/${v4()}`;

  return decodedMarker;
}