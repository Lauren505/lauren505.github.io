import HomeBody from "@/components/HomeBody";
import PageFold from "@/components/PageFold";
import PublicationsMorph from "@/components/PublicationsMorph";

export default function Home() {
  return (
    <main>
      {/* The fold's edge is the line between News and Selected Publications:
          About + News above it, the publications block below. */}
      <PageFold
        href="/publications"
        label="See all publications"
        above={<HomeBody />}
        below={<PublicationsMorph />}
      />
    </main>
  );
}
