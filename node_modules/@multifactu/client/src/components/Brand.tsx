import { Link } from "react-router-dom";
export default function Brand({
  dark = false,
  icon = false,
  to = "/",
}: {
  dark?: boolean;
  icon?: boolean;
  to?: string | null;
}) {
  if (to === null)
    return (
      <span aria-label="MULTIFACTU" className={`brand ${dark ? "dark" : ""} ${icon ? "icon" : ""}`}>
        <img
          src={
            icon ? "/brand/multifactu-isologo.png" : "/brand/multifactu-logo.png"
          }
          alt="MULTIFACTU Ecuador"
        />
      </span>
    );
  return (
    <Link
      to={to}
      aria-label="MULTIFACTU inicio"
      className={`brand ${dark ? "dark" : ""} ${icon ? "icon" : ""}`}
    >
      <img
        src={
          icon ? "/brand/multifactu-isologo.png" : "/brand/multifactu-logo.png"
        }
        alt="MULTIFACTU Ecuador"
      />
    </Link>
  );
}
