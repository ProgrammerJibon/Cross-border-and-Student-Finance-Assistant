import Link from "next/link";
export default function NotFound() {
  return (
    <div className="setup-error">
      <h1>404</h1>
      <Link className="button" href="/">
        ←
      </Link>
    </div>
  );
}
