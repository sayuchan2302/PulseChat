import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User, Message } from '../types';
import { apiClient } from '../services/api';
import './ChatPage.css';

export default function ChatPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) {
      navigate('/');
      return;
    }
    setCurrentUser(JSON.parse(user));
    loadUsers();
  }, [navigate]);

  const loadUsers = async () => {
    try {
      const response = await apiClient.get('/users');
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  const loadMessages = async (userId: string) => {
    try {
      const response = await apiClient.get(`/messages/${userId}`);
      setMessages(response.data);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const handleUserSelect = (user: User) => {
    setSelectedUser(user);
    loadMessages(user.id);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !selectedUser) return;

    try {
      await apiClient.post('/messages', {
        receiverId: selectedUser.id,
        content: messageInput,
      });
      setMessageInput('');
      loadMessages(selectedUser.id);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  return (
    <div className="chat-page">
      <header className="chat-header">
        <div className="header-left">
          <h2>💬 Chat App</h2>
        </div>
        <div className="header-right">
          <span className="username">{currentUser?.username}</span>
          <button onClick={handleLogout} className="logout-btn">Logout</button>
        </div>
      </header>

      <div className="chat-container">
        <aside className="sidebar">
          <div className="sidebar-header">
            <h3>Users</h3>
          </div>
          <div className="user-list">
            {users.map((user) => (
              <div
                key={user.id}
                className={`user-item ${selectedUser?.id === user.id ? 'active' : ''}`}
                onClick={() => handleUserSelect(user)}
              >
                <div className="user-avatar">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <div className="user-info">
                  <div className="user-name">{user.username}</div>
                  <div className={`user-status ${user.online ? 'online' : 'offline'}`}>
                    {user.online ? 'Online' : 'Offline'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <main className="chat-area">
          {selectedUser ? (
            <>
              <div className="chat-area-header">
                <div className="selected-user">
                  <div className="user-avatar">
                    {selectedUser.username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="user-name">{selectedUser.username}</div>
                    <div className={`user-status ${selectedUser.online ? 'online' : 'offline'}`}>
                      {selectedUser.online ? 'Online' : 'Offline'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="messages-container">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`message ${message.senderId === currentUser?.id ? 'sent' : 'received'}`}
                  >
                    <div className="message-content">{message.content}</div>
                    <div className="message-time">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={handleSendMessage} className="message-input-form">
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder="Type a message..."
                  className="message-input"
                />
                <button type="submit" className="send-btn">Send</button>
              </form>
            </>
          ) : (
            <div className="no-chat-selected">
              <p>Select a user to start chatting</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
