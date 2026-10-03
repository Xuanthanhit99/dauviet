import type {Metadata} from "next";
export const metadata:Metadata={title:"Bản đồ khám phá",description:"Khám phá địa điểm, sự kiện và lớp lịch sử trên bản đồ Dấu Việt.",alternates:{canonical:"/map"}};
import {ConsumerShell} from "../components/consumer-shell";
import "maplibre-gl/dist/maplibre-gl.css";
import ExploreMapClient from "./explore-map-client";

export default function MapPage() {
  return <ConsumerShell><ExploreMapClient /></ConsumerShell>;
}
