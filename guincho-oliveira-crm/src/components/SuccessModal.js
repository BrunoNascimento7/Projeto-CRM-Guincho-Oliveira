import React from 'react';
import './SuccessModal.css';

function SuccessModal({ message, onClose }) {
return (
<div className="success-modal-overlay">
<div className="success-modal">
<p>{message}</p>
<button onClick={onClose}>OK</button>
</div>
</div>
);
}

export default SuccessModal;