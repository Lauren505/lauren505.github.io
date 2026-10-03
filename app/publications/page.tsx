import PageLift from "@/components/PageLift";
import PublicationList from "@/components/PublicationList";

export const metadata = { title: "Publications — Lauren W. Wang" };

export default function PublicationsPage() {
  return (
    <>
      <PublicationList />
      {/* Pulling up at the top turns the cube back — the mirror of the fold at
          the foot of the home page. */}
      <PageLift href="/" label="Back to home" />
    </>
  );
}
