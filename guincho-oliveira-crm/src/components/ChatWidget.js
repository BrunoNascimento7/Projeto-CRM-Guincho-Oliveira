// Arquivo: src/components/ChatWidget.js

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useChat } from '../hooks/useChat';
import './ChatWidget.css';
import { FaPaperPlane, FaPaperclip, FaTimes, FaCommentDots, FaSignOutAlt, FaSmile, FaTasks, FaWrench, FaArrowLeft } from 'react-icons/fa';
import Picker from 'emoji-picker-react';
import LinkTaskModal from './LinkTaskModal';
import { Link } from 'react-router-dom';

const UserAvatar = ({ user, size = 'normal' }) => {
    const getInitials = (name = '') => {
        const nameParts = name.split(' ');
        if (nameParts.length > 1 && nameParts[0] && nameParts[1]) {
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

const TypingIndicator = () => ( <div className="typing-indicator"><div className="typing-dot"></div><div className="typing-dot"></div><div className="typing-dot"></div></div> );

const LinkCard = ({ data }) => {
    const to = data.tipo === 'Tarefa' ? '/quadro-tarefas' : `/ordens/${data.id.replace('os-', '')}`;
    return (
        <Link to={to} className="link-card" title={`Ir para ${data.tipo}`}>
            {data.tipo === 'Tarefa' ? <FaTasks className="result-icon task" /> : <FaWrench className="result-icon os" />}
            <div className="result-info">
                <span className="result-title">{data.titulo}</span>
                <span className="result-type">{data.tipo}</span>
            </div>
        </Link>
    );
};


export default function ChatWidget({ user }) {
    const [isOpen, setIsOpen] = useState(false);
    const [activeChatUserId, setActiveChatUserId] = useState(null);
    const [messageText, setMessageText] = useState('');
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [showLinkModal, setShowLinkModal] = useState(false);
    const [isBlinking, setIsBlinking] = useState(false);
    
    const { onlineUsers, messages, sendMessage, typingUsers, startTyping, stopTyping, markMessagesAsRead, unreadSenders } = useChat(user, activeChatUserId, isOpen);

    const fileInputRef = useRef(null);
    const messagesEndRef = useRef(null);
    const messageInputRef = useRef(null);
    const typingTimeoutRef = useRef(null);
    
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, activeChatUserId, typingUsers]);

    useEffect(() => {
        if (!isOpen && unreadSenders.size > 0) {
            setIsBlinking(true);
        } else {
            setIsBlinking(false);
        }
    }, [isOpen, unreadSenders]);

    const handleFileUpload = useCallback((file) => {
        if (!user || !user.id || !file || !activeChatUserId) return;
        if (file.size > 1e7) { alert("A imagem é muito grande! O limite é de 10MB."); return; }
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const fileData = { name: file.name || `Imagem_Colada_${Date.now()}.png`, type: file.type, data: reader.result };
            sendMessage({ senderId: user.id, receiverId: activeChatUserId, text: `Anexo: ${fileData.name}`, file: fileData });
        };
    }, [user, activeChatUserId, sendMessage]);

    useEffect(() => {
        const handlePaste = (event) => {
            const items = event.clipboardData?.items;
            if(!items) return;
            for (const item of items) {
                if (item.kind === 'file' && item.type.startsWith('image/')) {
                    const imageFile = item.getAsFile();
                    if(imageFile) handleFileUpload(imageFile);
                    event.preventDefault(); return;
                }
            }
        };
        const inputElement = messageInputRef.current;
        if (inputElement) inputElement.addEventListener('paste', handlePaste);
        return () => { if (inputElement) inputElement.removeEventListener('paste', handlePaste); };
    }, [handleFileUpload]);
    
    if (!user || !user.id) {
        return null;
    }

    const onEmojiClick = (emojiObject) => {
        setMessageText(prev => prev + emojiObject.emoji);
        setShowEmojiPicker(false);
        if (messageInputRef.current) {
            messageInputRef.current.focus();
        }
    };

    const handleSend = (e) => {
        e.preventDefault();
        if (!messageText.trim() || !activeChatUserId) return;
        sendMessage({ senderId: user.id, receiverId: activeChatUserId, text: messageText });
        setMessageText('');
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        stopTyping({ receiverId: activeChatUserId });
    };

    const handleTyping = (e) => {
        setMessageText(e.target.value);
        if (e.target.value.length > 0 && !typingTimeoutRef.current) {
            startTyping({ receiverId: activeChatUserId });
        }
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
            stopTyping({ receiverId: activeChatUserId });
            typingTimeoutRef.current = null;
        }, 2000);
    };
    
    const selectUserToChat = (userId) => {
        setActiveChatUserId(userId);
        markMessagesAsRead({ conversationPartnerId: userId });
    };

    const handleToggleOpen = () => {
        const nextIsOpenState = !isOpen;
        setIsOpen(nextIsOpenState);
        if (nextIsOpenState && activeChatUserId) {
            markMessagesAsRead({ conversationPartnerId: activeChatUserId });
        }
    };
    
    const handleLinkSend = (item) => {
        const linkData = { type: 'link', linkData: item };
        sendMessage({ senderId: user.id, receiverId: activeChatUserId, text: `Vínculo: ${item.titulo}`, file: linkData });
        setShowLinkModal(false);
    };
    
    const usersToDisplay = onlineUsers.filter(u => {
        if (u.userId === user.id) return false;
        if (user.perfil === 'admin_geral') {
            return true;
        }
        if (user.cliente_id) {
            return u.clienteId === null || u.clienteId === user.cliente_id;
        }
        return false;
    });
    
    const activeChatUser = onlineUsers.find(u => u.userId === activeChatUserId);
    const isReceiverTyping = typingUsers[activeChatUserId];

    return (
        <>
            <div className={`chat-widget-container ${isOpen ? 'open' : ''}`}>
                <button onClick={handleToggleOpen} className={`chat-toggle-button ${isBlinking ? 'blinking' : ''}`}>
                    {isOpen ? <FaTimes /> : <FaCommentDots />}
                    {!isOpen && unreadSenders.size > 0 && (
                        <span className="unread-count">{unreadSenders.size}</span>
                    )}
                </button>

                <div className="chat-main-window">
                    <div className={`user-list-panel ${activeChatUserId ? 'hidden-mobile' : ''}`}>
                        <div className="chat-header">
                            <h3>Usuários Online</h3>
                            <button className="close-button" onClick={handleToggleOpen} title="Fechar Chat">
                                <FaTimes />
                            </button>
                        </div>
                        <ul className="user-list">
                            {usersToDisplay.map(u => (
                                <li key={u.userId} onClick={() => selectUserToChat(u.userId)} className={unreadSenders.has(u.userId) ? 'unread' : ''}>
                                    <UserAvatar user={u} />
                                    <span className="user-name">{u.name}</span>
                                    {unreadSenders.has(u.userId) && <span className="unread-dot"></span>}
                                </li>
                            ))}
                        </ul>
                        <div className="user-list-footer">
                            <div className="admin-info">
                                <UserAvatar user={user} />
                                <span className="user-name">{user.nome}</span>
                            </div>
                            <button className="logout-button" onClick={handleToggleOpen} title="Fechar Chat">
                                <FaSignOutAlt />
                            </button>
                        </div>
                    </div>

                    <div className={`chat-window-panel ${!activeChatUserId ? 'hidden-mobile' : ''}`}>
                        {activeChatUser ? (
                            <>
                                <div className="chat-header mobile-chat-active">
                                    <button className="back-button" onClick={() => setActiveChatUserId(null)} title="Voltar para a lista">
                                        <FaArrowLeft />
                                    </button>
                                    <h3>{activeChatUser.name}</h3>
                                    <button className="close-button" onClick={handleToggleOpen} title="Fechar Chat">
                                        <FaTimes />
                                    </button>
                                </div>
                                
                                <div className="messages-area">
                                    {(messages[activeChatUserId] || []).map((msg, index) => (
                                        <div key={msg.id || `msg-${index}`} className={`message-bubble-wrapper ${msg.type}`}>
                                            <div className="message-bubble">
                                                {msg.file?.type === 'link' ? (
                                                    <LinkCard data={msg.file.linkData} />
                                                ) : msg.file ? (
                                                    <a href={msg.file.data} download={msg.file.name} target="_blank" rel="noopener noreferrer" className="attachment-link">
                                                        <FaPaperclip /> {msg.file.name}
                                                    </a>
                                                ) : (
                                                    msg.text
                                                )}
                                            </div>
                                            {msg.type === 'sent' && msg.status === 'read' && (
                                                <div className="read-receipt-avatar" title={`Lido por ${activeChatUser?.name}`}>
                                                    <UserAvatar user={activeChatUser} size="small" />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {isReceiverTyping && <TypingIndicator />}
                                    <div ref={messagesEndRef} />
                                </div>
                                <form className="message-input-form" onSubmit={handleSend}>
                                    {showEmojiPicker && <div className="emoji-picker-wrapper"><Picker onEmojiClick={onEmojiClick} /></div>}
                                    <button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)}><FaSmile /></button>
                                    <button type="button" onClick={() => setShowLinkModal(true)} title="Vincular Tarefa ou OS"><FaTasks /></button>
                                    <input type="file" ref={fileInputRef} onChange={(e) => handleFileUpload(e.target.files[0])} style={{ display: 'none' }} />
                                    <button type="button" onClick={() => fileInputRef.current.click()} title="Anexar arquivo"><FaPaperclip /></button>
                                    <input type="text" placeholder="Digite uma mensagem..." value={messageText} onChange={handleTyping} autoComplete="off" ref={messageInputRef} disabled={!activeChatUserId}/>
                                    <button type="submit" className="send-button">
                                        <FaPaperPlane />
                                    </button>
                                </form>
                            </>
                        ) : ( <div className="no-chat-selected"> <FaCommentDots /><p>Selecione um usuário para iniciar uma conversa.</p></div> )}
                    </div>
                </div>
            </div>
            {showLinkModal && <LinkTaskModal onClose={() => setShowLinkModal(false)} onLink={handleLinkSend} />}
        </>
    );
}