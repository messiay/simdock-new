import { useState } from 'react';
import { useUserStore } from '../../store/userStore';
import { Dna, ArrowRight, Activity } from 'lucide-react';
import '../styles/LoginScreen.css';

export function LoginScreen() {
    const [username, setUsername] = useState('');
    const login = useUserStore((state) => state.login);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (username.trim()) {
            login(username.trim());
        }
    };

    return (
        <div className="login-screen">
            <div className="login-card">
                <div className="login-header">
                    <div className="login-logo">
                        <Dna size={48} className="logo-icon" />
                        <span className="logo-text">SimDock Pro</span>
                    </div>
                    <p className="login-subtitle">Molecular Docking Mission Control</p>
                </div>

                <div className="login-status">
                    <Activity size={16} />
                    <span>System Ready</span>
                </div>

                <form onSubmit={handleSubmit} className="login-form">
                    <div className="input-group">
                        <label>Mission Commander</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Enter your ID / Name"
                            autoFocus
                        />
                    </div>
                    <button type="submit" className="login-btn" disabled={!username.trim()}>
                        <span>Initialize Session</span>
                        <ArrowRight size={18} />
                    </button>
                    <p className="login-footer">Local secure session initialized via IndxDB</p>
                </form>
            </div>
            <div className="login-bg-grid"></div>
        </div>
    );
}
