import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { DarkModeToggle } from './DarkModeToggle';
import { RoleBadge } from './RoleBadge';

export function AppHeader() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleNav = (path: string) => {
    navigate(path);
    setMenuOpen(false);
  };

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  // Close menu on resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close menu on navigation
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <header className="dashboard-header" ref={menuRef}>
      <h1>MyApp Platform</h1>
      <button
        className="btn-hamburger"
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={menuOpen}
      >
        <span className={`hamburger-icon ${menuOpen ? 'open' : ''}`}>
          <span></span>
          <span></span>
          <span></span>
        </span>
      </button>
      <nav className={`header-nav ${menuOpen ? 'nav-open' : ''}`}>
        <button onClick={() => handleNav('/dashboard')} className={`btn-nav ${isActive('/dashboard') ? 'active' : ''}`}>Dashboard</button>
        <button onClick={() => handleNav('/cameras')} className={`btn-nav ${isActive('/cameras') ? 'active' : ''}`}>Cameras</button>
        <span className="nav-divider" />
        <button onClick={() => handleNav('/submit-feature')} className={`btn-nav ${isActive('/submit-feature') ? 'active' : ''}`}>Request Feature</button>
        <button onClick={() => handleNav('/feature-summary')} className={`btn-nav ${isActive('/feature-summary') ? 'active' : ''}`}>Feature Summary</button>
        {user?.role === 'admin' && <button onClick={() => handleNav('/admin')} className={`btn-nav ${isActive('/admin') ? 'active' : ''}`}>Admin</button>}
        <button onClick={() => handleNav('/account')} className={`btn-nav ${isActive('/account') ? 'active' : ''}`}>Account</button>
        <RoleBadge />
        <DarkModeToggle />
      </nav>
    </header>
  );
}
