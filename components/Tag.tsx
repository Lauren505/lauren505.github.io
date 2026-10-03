import { Paperclip } from "@/components/Icons";
import styles from "./Tag.module.css";

type Props = {
  links: { label: string; href: string }[];
  small?: boolean;
  className?: string;
  /** Marks this group as a flying element in the home page's fold. */
  flip?: string;
  /** Marks it as the slot such a group flies to. */
  flipTo?: string;
};

export default function Tags({ links, small, className, flip, flipTo }: Props) {
  if (links.length === 0) return null;

  return (
    <div
      className={[styles.tags, small ? styles.small : "", className].filter(Boolean).join(" ")}
      data-flip={flip}
      data-flip-to={flipTo}
      data-flip-mode={flip ? "text" : undefined}
    >
      {links.map((link) => (
        <a key={link.label} className={styles.tag} href={link.href}>
          <Paperclip />
          {link.label}
        </a>
      ))}
    </div>
  );
}
