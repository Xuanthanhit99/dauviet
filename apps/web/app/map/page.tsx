import {ConsumerShell} from "../components/consumer-shell";
import "maplibre-gl/dist/maplibre-gl.css";
import ExploreMapClient from "./explore-map-client";

export default function MapPage() {
  return <ConsumerShell><ExploreMapClient /></ConsumerShell>;
}
