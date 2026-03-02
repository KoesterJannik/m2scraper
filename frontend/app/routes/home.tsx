import type { Route } from "./+types/home";
import { Navbar } from "../components/Navbar";
import { Welcome } from "../welcome/welcome";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "M2 Scraper" },
    { name: "description", content: "Welcome to M2 Scraper!" },
  ];
}

export default function Home() {
  return (
    <>
      <Navbar />
     
    </>
  );
}
