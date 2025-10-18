// Arquivo: src/hooks/useChat.js

import { useEffect, useState, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import api from '../services/api';

export const useChat = (user, activeChatUserId, isChatOpen) => {
    const [onlineUsers, setOnlineUsers] = useState([]);
    const [messages, setMessages] = useState({});
    const [lastMessage, setLastMessage] = useState(null);
    const [typingUsers, setTypingUsers] = useState({});
    const [unreadSenders, setUnreadSenders] = useState(new Set());
    const socket = useRef(null);
    
    useEffect(() => {
        if (!user || !user.id) {
            if (socket.current) {
                socket.current.disconnect();
                socket.current = null;
            }
            return;
        }

        if (!socket.current) {
            socket.current = io(process.env.REACT_APP_API_BASE_URL || "https://projeto-crm-guincho-oliveira.onrender.com");
        }

        const currentSocket = socket.current;
        
        currentSocket.emit("newUser", user.id); 
        
        currentSocket.on("getUsers", (users) => {
            setOnlineUsers(users);
        });

        currentSocket.on("getMessage", (data) => {
            setMessages(prev => {
                const newMessage = { ...data, type: 'received', status: 'delivered' };
                const newMessagesForSender = [...(prev[data.senderId] || []), newMessage];
                return { ...prev, [data.senderId]: newMessagesForSender };
            });
            setLastMessage({ ...data, id: Date.now() });

            if (!isChatOpen || data.senderId !== activeChatUserId) {
                setUnreadSenders(prev => new Set(prev).add(data.senderId));
            }
        });

        currentSocket.on("typing", ({ senderId, isTyping }) => {
            setTypingUsers(prev => ({ ...prev, [senderId]: isTyping }));
        });
        
        currentSocket.on("messageDelivered", ({ messageId, receiverId }) => {
            setMessages(prev => {
                const userMessages = (prev[receiverId] || []).map(msg =>
                    msg.id === messageId ? { ...msg, status: 'delivered' } : msg
                );
                return { ...prev, [receiverId]: userMessages };
            });
        });

        currentSocket.on("messagesRead", ({ readerId }) => {
            setMessages(prev => {
                const userMessages = (prev[readerId] || []).map(msg => 
                    msg.type === 'sent' && msg.status !== 'read' ? { ...msg, status: 'read' } : msg
                );
                return { ...prev, [readerId]: userMessages };
            });
        });

        return () => {
            if (currentSocket) {
                currentSocket.off("getUsers");
                currentSocket.off("getMessage");
                currentSocket.off("typing");
                currentSocket.off("messageDelivered");
                currentSocket.off("messagesRead");
            }
        };
    }, [user, activeChatUserId, isChatOpen]);

    useEffect(() => {
        if (!user?.id) return;
        
        const fetchUnread = async () => {
            try {
                const { data } = await api.get('/api/chat/unread-summary');
                const senderIds = new Set(data.map(item => item.sender_id));
                setUnreadSenders(senderIds);
            } catch (error) {
                console.error("Erro ao carregar mensagens não lidas:", error);
            }
        };
        fetchUnread();
    }, [user]);

    const sendMessage = useCallback(({ senderId, receiverId, text, file }) => {
        if (socket.current) {
            const messageData = {
                senderId, receiverId, text, file,
                id: `${senderId}-${Date.now()}`,
                status: 'sent',
                type: 'sent'
            };
            socket.current.emit("sendMessage", messageData);
            setMessages(prev => {
                const newMessagesForReceiver = [...(prev[receiverId] || []), messageData];
                return { ...prev, [receiverId]: newMessagesForReceiver };
            });
        }
    }, []);

    const markMessagesAsRead = useCallback(({ conversationPartnerId }) => {
        if (socket.current) {
            socket.current.emit("markAsRead", { conversationPartnerId });
            setUnreadSenders(prev => {
                const newUnread = new Set(prev);
                newUnread.delete(conversationPartnerId);
                return newUnread;
            });
        }
    }, []);

    const startTyping = useCallback(({ receiverId }) => { socket.current?.emit("startTyping", { receiverId }); }, []);
    const stopTyping = useCallback(({ receiverId }) => { socket.current?.emit("stopTyping", { receiverId }); }, []);
    
    return { 
        onlineUsers, messages, sendMessage, lastMessage, typingUsers, 
        startTyping, stopTyping, markMessagesAsRead,
        unreadSenders
    };
};