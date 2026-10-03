import PublicationRows from "@/components/PublicationRows";
import { publications } from "@/content";
import styles from "./PublicationList.module.css";

export default function PublicationList() {
  return (
    <main className={styles.list}>
      {/* Matches the heading the home page's cube turns into. */}
      <h1 className={styles.heading}>Publications</h1>
      <PublicationRows items={publications} />
    </main>
  );
}
