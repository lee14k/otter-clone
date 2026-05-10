import { NavLink, Outlet } from "react-router-dom";

export default function Layout() {
  const linkBase =
    "px-3 py-2 rounded text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-800";
  const active = "bg-slate-900 text-white hover:bg-slate-900";

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <nav className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-2">
          <span className="font-semibold mr-4">Otter</span>
          <NavLink
            to="/"
            end
            className={({ isActive }) => `${linkBase} ${isActive ? active : ""}`}
          >
            Record
          </NavLink>
          <NavLink
            to="/lectures"
            className={({ isActive }) => `${linkBase} ${isActive ? active : ""}`}
          >
            Lectures
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) => `${linkBase} ${isActive ? active : ""}`}
          >
            Settings
          </NavLink>
        </nav>
      </header>
      <main className="flex-1 max-w-5xl mx-auto w-full p-4">
        <Outlet />
      </main>
    </div>
  );
}
