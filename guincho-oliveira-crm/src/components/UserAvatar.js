import React from 'react';
import './Header.css'; // Usará estilos do Header

// Componente inteligente para exibir o avatar ou as iniciais
export default function UserAvatar({ user, size = 'normal' }) {
    const getInitials = (name = '') => {
        const nameParts = name.split(' ');
        if (nameParts.length > 1) {
            return `${nameParts[0][0]}${nameParts[1][0]}`.toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    };

    const hasValidAvatar = user?.avatar && typeof user.avatar === 'string' && user.avatar.startsWith('data:image');
    const hasValidProfilePic = user?.foto_perfil && typeof user.foto_perfil === 'string' && user.foto_perfil.startsWith('data:image');
    const finalAvatar = hasValidAvatar ? user.avatar : hasValidProfilePic ? user.foto_perfil : null;

    if (finalAvatar) {
        return <img src={finalAvatar} alt={user.name || user.nome} className={`user-avatar-img ${size}`} />;
    }

    return (
        <div className={`avatar-placeholder ${size}`}>
            {getInitials(user?.name || user?.nome)}
        </div>
    );
};