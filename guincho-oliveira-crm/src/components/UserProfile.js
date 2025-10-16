// src/components/UserProfile.js
import React, { useState, useEffect } from 'react';
import './UserProfile.css';

export default function UserProfile({ user }) {
  const [profilePhoto, setProfilePhoto] = useState(null);

  useEffect(() => {
    const storedPhoto = localStorage.getItem('userProfilePhoto');
    if (storedPhoto) {
      setProfilePhoto(storedPhoto);
    }
  }, []);

  function handlePhotoChange(e) {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setProfilePhoto(reader.result);
        localStorage.setItem('userProfilePhoto', reader.result);
      };
      reader.readAsDataURL(file);
    }
  }

  return (
    <div className="user-profile-widget">
      <div className="profile-photo" onClick={() => document.getElementById('photoInput').click()}>
        {profilePhoto ? (
          <img src={profilePhoto} alt="Foto de Perfil" />
        ) : (
          <span>{user.nome.charAt(0)}</span>
        )}
      </div>
      <input type="file" id="photoInput" onChange={handlePhotoChange} style={{ display: 'none' }} />
      <div className="user-info">
        <span className="user-name">{user.nome}</span>
        <span className="user-role">{user.perfil}</span>
      </div>
    </div>
  );
}