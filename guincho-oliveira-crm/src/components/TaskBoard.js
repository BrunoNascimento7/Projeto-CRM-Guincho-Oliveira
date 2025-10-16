import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import api from '../services/api';
import './TaskBoard.css';
import { useAuth } from '../hooks/useAuth';
import { FaPlus, FaUserFriends, FaRegCommentDots, FaCalendarAlt, FaTrash, FaPencilAlt, FaCheck, FaTimes } from 'react-icons/fa';

// O prefixo de rota para o módulo de Kanban/Tarefas
const KANBAN_BASE_PATH = '/api/tasks';

// ====================================================================
// === SUB-COMPONENTE: Modal de Compartilhamento de Usuários
// ====================================================================
const UserShareModal = ({ allUsers, sharedUserIds, onSave, onClose }) => {
    const [selectedUsers, setSelectedUsers] = useState(new Set(sharedUserIds));
    const { id: currentUserId } = useAuth();

    const handleToggleUser = (userId) => {
        const newSelection = new Set(selectedUsers);
        if (newSelection.has(userId)) {
            newSelection.delete(userId);
        } else {
            newSelection.add(userId);
        }
        setSelectedUsers(newSelection);
    };

    const handleSave = () => {
        onSave(Array.from(selectedUsers));
        onClose();
    };
    
    // Filtra todos os usuários exceto o usuário logado, para evitar que ele compartilhe consigo mesmo.
    const usersToDisplay = allUsers.filter(user => user.id !== currentUserId);

    return (
        <div className="user-share-modal-overlay">
            <div className="user-share-modal-content">
                <div className="modal-header">
                    <h3>Compartilhar com Usuários</h3>
                    <button onClick={onClose} className="modal-close-button">&times;</button>
                </div>
                <div className="user-list-container">
                    {usersToDisplay.length > 0 ? usersToDisplay.map(user => (
                        <div key={user.id} className="user-share-item">
                            <input
                                type="checkbox"
                                id={`share-user-${user.id}`}
                                checked={selectedUsers.has(user.id)}
                                onChange={() => handleToggleUser(user.id)}
                            />
                            <label htmlFor={`share-user-${user.id}`}>{user.nome}</label>
                        </div>
                    )) : <p>Nenhum outro usuário encontrado para compartilhar.</p>}
                </div>
                <div className="modal-footer">
                    <button type="button" onClick={onClose} className="close-button">Cancelar</button>
                    <button type="button" onClick={handleSave} className="save-button">Salvar</button>
                </div>
            </div>
        </div>
    );
};


// ====================================================================
// === SUB-COMPONENTE: Modal de Criação/Edição de Tarefa
// ====================================================================
const TaskModal = ({ task, onClose, onSave, users, columns, onDelete }) => {
    const [formData, setFormData] = useState({
        titulo: '',
        descricao: '',
        data_inicio: '',
        data_finalizacao: '',
        usuarios_compartilhados: [],
        coluna_id: null,
        ...task
    });
    const [notas, setNotas] = useState([]);
    const [novaNota, setNovaNota] = useState('');
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const { id: currentUserId, nome: currentUserName, perfil } = useAuth();

    useEffect(() => {
        if (task && task.id) {
            const fetchNotas = async () => {
                try {
                    const token = localStorage.getItem('token');
                    // ROTA ATUALIZADA
                    const { data } = await api.get(`${KANBAN_BASE_PATH}/tarefas/${task.id}/notas`, { headers: { 'Authorization': `Bearer ${token}` } });
                    setNotas(data);
                } catch (error) {
                    console.error("Erro ao buscar notas:", error);
                }
            };
            fetchNotas();
        }
        if (!formData.coluna_id && columns.length > 0) {
            setFormData(prev => ({...prev, coluna_id: columns[0].id}));
        }
    }, [task, columns]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSaveSharedUsers = (updatedUserIds) => {
        setFormData(prev => ({ ...prev, usuarios_compartilhados: updatedUserIds }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    const handleAddNota = async () => {
        if (!novaNota.trim() || !task.id) return;
        try {
            const token = localStorage.getItem('token');
            const config = { headers: { 'Authorization': `Bearer ${token}` } };
            // ROTA ATUALIZADA
            await api.post(`${KANBAN_BASE_PATH}/tarefas/${task.id}/notas`, { nota: novaNota, autor: currentUserName }, config);
            // ROTA ATUALIZADA
            const { data } = await api.get(`${KANBAN_BASE_PATH}/tarefas/${task.id}/notas`, config);
            setNotas(data);
            setNovaNota('');
        } catch (error) {
            console.error("Erro ao adicionar nota:", error);
            // Substitui alert() por uma mensagem mais amigável no console, ou um modal customizado
            // console.error("Não foi possível adicionar a nota.");
        }
    };
    
    // As chamadas para api.get('/usuarios') precisam ser atualizadas no TaskBoard principal

    const canDelete = perfil === 'admin_geral' || (task && task.criado_por === currentUserId);
    // Usa a mesma lógica de filtragem da modal de compartilhamento.
    const availableUsersToShare = users.filter(u => u.id !== currentUserId);

    return (
        <>
            <div className="task-modal-overlay" onClick={onClose}>
                <div className="task-modal-content" onClick={e => e.stopPropagation()}>
                    <div className="modal-header">
                        <h3><FaPencilAlt /> {task && task.id ? 'Editar Tarefa' : 'Nova Tarefa'}</h3>
                        <button onClick={onClose} className="modal-close-button">&times;</button>
                    </div>
                    <form id="task-form-main" onSubmit={handleSubmit} className="task-form">
                        <div className="form-group">
                            <label htmlFor="titulo">Título</label>
                            <input id="titulo" type="text" name="titulo" value={formData.titulo} onChange={handleChange} required placeholder="Ex: Verificar documentação do reboque" />
                        </div>
                        <div className="form-group">
                            <label htmlFor="coluna_id">Status / Coluna</label>
                            <select id="coluna_id" name="coluna_id" value={formData.coluna_id || ''} onChange={handleChange} required>
                                {columns.map(col => <option key={col.id} value={col.id}>{col.titulo}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label htmlFor="descricao">Descrição</label>
                            <textarea id="descricao" name="descricao" value={formData.descricao || ''} onChange={handleChange} placeholder="Adicione mais detalhes sobre a tarefa..."></textarea>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="data_inicio">Data de Início</label>
                                <input id="data_inicio" type="date" name="data_inicio" value={formData.data_inicio ? formData.data_inicio.split('T')[0] : ''} onChange={handleChange} />
                            </div>
                            <div className="form-group">
                                <label htmlFor="data_finalizacao">Data de Finalização</label>
                                <input id="data_finalizacao" type="date" name="data_finalizacao" value={formData.data_finalizacao ? formData.data_finalizacao.split('T')[0] : ''} onChange={handleChange} />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Compartilhar Com</label>
                            <button type="button" className="share-button" onClick={() => setIsShareModalOpen(true)} disabled={availableUsersToShare.length === 0}>
                                <FaUserFriends /> {formData.usuarios_compartilhados.length > 0 ? `Compartilhado com ${formData.usuarios_compartilhados.length} usuário(s)` : 'Adicionar / Remover Usuários'}
                            </button>
                            {availableUsersToShare.length === 0 && <small className="form-text-muted">Nenhum outro usuário disponível para compartilhar.</small>}
                        </div>
                        {task && task.id && (
                            <div className="notas-section">
                                <h4><FaRegCommentDots /> Notas</h4>
                                <div className="notas-list">
                                    {notas.length > 0 ? notas.map((nota, index) => (
                                        <div key={index} className="nota-item">
                                            <div className="nota-header">
                                                <strong>{nota.usuario_nome}</strong>
                                                <span>{new Date(nota.data_criacao).toLocaleString('pt-BR')}</span>
                                            </div>
                                            <p>{nota.nota}</p>
                                        </div>
                                    )) : <p className="no-notes">Nenhuma nota ainda.</p>}
                                </div>
                                <div className="nova-nota-form">
                                    <textarea value={novaNota} onChange={(e) => setNovaNota(e.target.value)} placeholder="Adicionar um comentário..."></textarea>
                                    <button type="button" onClick={handleAddNota}>Comentar</button>
                                </div>
                            </div>
                        )}
                    </form>
                    <div className="modal-footer">
                        <div>
                            {task && task.id && canDelete && (<button type="button" className="delete-button" onClick={() => onDelete(task.id)}><FaTrash /> Excluir</button>)}
                        </div>
                        <div className="footer-actions-right">
                            <button type="button" className="close-button" onClick={onClose}>Fechar</button>
                            <button type="submit" className="save-button" form="task-form-main"><FaCheck /> Salvar</button>
                        </div>
                    </div>
                </div>
            </div>
            {isShareModalOpen && <UserShareModal allUsers={users} sharedUserIds={formData.usuarios_compartilhados} onSave={handleSaveSharedUsers} onClose={() => setIsShareModalOpen(false)} />}
        </>
    );
};


// ====================================================================
// === COMPONENTE PRINCIPAL: Quadro de Tarefas
// ====================================================================
export default function TaskBoard() {
    const [columns, setColumns] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTask, setEditingTask] = useState(null);
    const [allUsers, setAllUsers] = useState([]);
    const [isAddingColumn, setIsAddingColumn] = useState(false);
    const [newColumnTitle, setNewColumnTitle] = useState('');
    const [editingColumn, setEditingColumn] = useState({ id: null, title: '' });
    const { nome, perfil } = useAuth();

    const fetchData = async () => {
        const token = localStorage.getItem('token');
        const config = { headers: { 'Authorization': `Bearer ${token}` } };
        try {
            const [colsRes, tasksRes, usersRes] = await Promise.all([
                // ROTA ATUALIZADA
                api.get(`${KANBAN_BASE_PATH}/kanban/colunas`, config),
                // ROTA ATUALIZADA
                api.get(`${KANBAN_BASE_PATH}/tarefas`, config),
                // Rota de usuários não estava no módulo Kanban, mantendo original se for global
                api.get('/api/usuarios', config) 
            ]);
            setColumns(colsRes.data);
            setTasks(tasksRes.data);
            setAllUsers(usersRes.data);
            console.log("Usuários carregados:", usersRes.data); // Log para depuração
        } catch (error) {
            console.error("Erro ao buscar dados do quadro", error);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);
    
    const onDragEnd = async (result) => {
        const { source, destination, draggableId } = result;
        if (!destination || (source.droppableId === destination.droppableId && source.index === destination.index)) {
            return;
        }
        const taskId = parseInt(draggableId);
        const newColumnId = parseInt(destination.droppableId);
        const updatedTasks = tasks.map(t => t.id === taskId ? { ...t, coluna_id: newColumnId } : t);
        setTasks(updatedTasks);
        try {
            const token = localStorage.getItem('token');
            // ROTA ATUALIZADA
            await api.put(`${KANBAN_BASE_PATH}/tarefas/${taskId}/status`, { coluna_id: newColumnId }, { headers: { 'Authorization': `Bearer ${token}` } });
        } catch (error) {
            console.error("Erro ao mover tarefa", error);
            // Reverte em caso de erro
            fetchData();
        }
    };
    
    const handleOpenModal = (task = null, columnId = null) => {
        const initialTask = task ? task : { coluna_id: columnId || (columns.length > 0 ? columns[0].id : null) };
        setEditingTask(initialTask);
        setIsModalOpen(true);
    };

    const handleSaveTask = async (taskData) => {
        const token = localStorage.getItem('token');
        const config = { headers: { 'Authorization': `Bearer ${token}` } };
        try {
            if (taskData.id) {
                // ROTA ATUALIZADA
                await api.put(`${KANBAN_BASE_PATH}/tarefas/${taskData.id}`, taskData, config);
            } else {
                // ROTA ATUALIZADA
                await api.post(`${KANBAN_BASE_PATH}/tarefas`, taskData, config);
            }
            setIsModalOpen(false);
            setEditingTask(null);
            fetchData();
        } catch (error) {
             // Substitui alert() por algo mais robusto
            console.error("Falha ao salvar a tarefa:", error.response?.data || error.message);
            // alert("Falha ao salvar a tarefa.");
        }
    };

    const handleDeleteTask = async (taskId) => {
        // Substitui window.confirm() por algo mais robusto ou mantém, dependendo do ambiente
        const confirmDelete = window.confirm("Tem certeza que deseja excluir esta tarefa?");
        if (confirmDelete) {
            const token = localStorage.getItem('token');
            try {
                // ROTA ATUALIZADA
                await api.delete(`${KANBAN_BASE_PATH}/tarefas/${taskId}`, { headers: { 'Authorization': `Bearer ${token}` } });
                setIsModalOpen(false);
                setEditingTask(null);
                fetchData();
            } catch (error) {
                // Substitui alert()
                console.error("Falha ao excluir a tarefa:", error.response?.data || error.message);
                // alert("Falha ao excluir a tarefa.");
            }
        }
    };
    
    const handleAddNewColumn = async (e) => {
        e.preventDefault();
        if (!newColumnTitle.trim()) return;
        const token = localStorage.getItem('token');
        try {
            // ROTA ATUALIZADA
            const { data: newColumn } = await api.post(`${KANBAN_BASE_PATH}/kanban/colunas`, { titulo: newColumnTitle }, { headers: { 'Authorization': `Bearer ${token}` } });
            setColumns([...columns, newColumn]);
            setNewColumnTitle('');
            setIsAddingColumn(false);
        } catch (error) {
            // Substitui alert()
            console.error("Falha ao criar nova coluna:", error.response?.data || error.message);
            // alert("Falha ao criar nova coluna.");
        }
    };

    const handleRenameColumn = async (columnId) => {
        const originalTitle = columns.find(c => c.id === columnId)?.titulo;
        if (!editingColumn.title.trim() || editingColumn.title === originalTitle) {
            setEditingColumn({ id: null, title: '' });
            return;
        }
        const token = localStorage.getItem('token');
        try {
            // ROTA ATUALIZADA
            await api.put(`${KANBAN_BASE_PATH}/kanban/colunas/${columnId}`, { titulo: editingColumn.title }, { headers: { 'Authorization': `Bearer ${token}` } });
            setColumns(columns.map(c => c.id === columnId ? { ...c, titulo: editingColumn.title } : c));
            setEditingColumn({ id: null, title: '' });
        } catch (error) {
            // Substitui alert()
            console.error("Falha ao renomear coluna:", error.response?.data || error.message);
            // alert("Falha ao renomear coluna.");
        }
    };

    const handleDeleteColumn = async (columnId) => {
        const columnToDelete = columns.find(c => c.id === columnId);
        if (!columnToDelete) return;

        const tasksInColumn = tasks.filter(task => task.coluna_id === columnId);
        const hasTasks = tasksInColumn.length > 0;

        let confirmDelete = false;
        let message = '';
        const isSelfCreated = columnToDelete.criado_por === nome; // Simplificado

        if (hasTasks && perfil !== 'admin_geral') {
            message = `Não é possível excluir a coluna "${columnToDelete.titulo}", pois ela contém tarefas. Por favor, mova as tarefas para outra coluna primeiro.`;
            // Substitui alert()
            console.error(message);
             // alert(message);
            return;
        } else if (hasTasks && perfil === 'admin_geral') {
            // Substitui window.confirm()
            confirmDelete = window.confirm(
                `ATENÇÃO, ADMINISTRADOR!\n\nA coluna "${columnToDelete.titulo}" contém ${tasksInColumn.length} tarefa(s).\n\nDeseja excluir a coluna E TODAS AS SUAS TAREFAS permanentemente?`
            );
        } else {
            // Substitui window.confirm()
            confirmDelete = window.confirm(
                `Tem certeza que deseja excluir a coluna "${columnToDelete.titulo}"? Esta ação não pode ser desfeita.`
            );
        }

        if (confirmDelete) {
            try {
                const token = localStorage.getItem('token');
                // ROTA ATUALIZADA
                await api.delete(`${KANBAN_BASE_PATH}/kanban/colunas/${columnId}`, { headers: { 'Authorization': `Bearer ${token}` } });
                
                setColumns(currentColumns => currentColumns.filter(c => c.id !== columnId));
                if (hasTasks) {
                    setTasks(currentTasks => currentTasks.filter(t => t.coluna_id !== columnId));
                }
            } catch (error) {
                console.error("Falha ao excluir a coluna:", error.response?.data || error.message);
                // alert(error.response?.data?.error || "Ocorreu um erro ao excluir a coluna.");
            }
        }
    };

    return (
        <div className="task-board-container">
            <header className="board-header">
                <h1>Quadro de Tarefas</h1>
                <p>Olá {nome}! Organize seu fluxo de trabalho.</p>
            </header>
            <DragDropContext onDragEnd={onDragEnd}>
                <div className="columns-wrapper">
                    <div className="columns-container">
                        {columns.map(column => (
                            <Droppable key={column.id} droppableId={String(column.id)}>
                                {(provided, snapshot) => (
                                    <div ref={provided.innerRef} {...provided.droppableProps} className={`task-column ${snapshot.isDraggingOver ? 'dragging-over' : ''}`}>
                                        <div className="column-header">
                                            {editingColumn.id === column.id ? (
                                                <form className="edit-column-form" onSubmit={(e) => { e.preventDefault(); handleRenameColumn(column.id); }}>
                                                    <input type="text" value={editingColumn.title} onChange={(e) => setEditingColumn({...editingColumn, title: e.target.value})} onBlur={() => handleRenameColumn(column.id)} autoFocus />
                                                </form>
                                            ) : (
                                                <h3 onClick={() => setEditingColumn({ id: column.id, title: column.titulo })}>
                                                    {column.titulo} 
                                                    <span className="task-count">{tasks.filter(t => t.coluna_id === column.id).length}</span>
                                                </h3>
                                            )}
                                            <div className="column-header-actions">
                                                <button onClick={() => setEditingColumn({ id: column.id, title: column.titulo })} className="column-action-button" title="Renomear coluna"><FaPencilAlt /></button>
                                                <button onClick={() => handleDeleteColumn(column.id)} className="column-action-button delete" title="Excluir coluna"><FaTrash /></button>
                                                <button onClick={() => handleOpenModal(null, column.id)} className="column-action-button add-task" title="Adicionar tarefa"><FaPlus /></button>
                                            </div>
                                        </div>
                                        <div className="tasks-list">
                                            {tasks.filter(t => t.coluna_id === column.id).map((item, index) => (
                                                <Draggable key={item.id} draggableId={String(item.id)} index={index}>
                                                    {(provided, snapshot) => (
                                                        <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} className={`task-card ${snapshot.isDragging ? 'dragging' : ''}`} onClick={() => handleOpenModal(item)}>
                                                            <h4>{item.titulo}</h4>
                                                            <div className="card-footer">
                                                                <small>{item.nome_criador}</small>
                                                                <div className="card-icons">
                                                                    {item.usuarios_compartilhados?.length > 0 && <FaUserFriends title={`Compartilhado com ${item.usuarios_compartilhados.length}`} />}
                                                                    {item.data_finalizacao && <FaCalendarAlt title={`Prazo: ${new Date(item.data_finalizacao).toLocaleDateString()}`} />}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </Draggable>
                                            ))}
                                            {provided.placeholder}
                                        </div>
                                    </div>
                                )}
                            </Droppable>
                        ))}
                        <div className="add-column-container">
                            {isAddingColumn ? (
                                <form onSubmit={handleAddNewColumn} className="add-column-form">
                                    <input type="text" placeholder="Nome da nova coluna..." value={newColumnTitle} onChange={(e) => setNewColumnTitle(e.target.value)} autoFocus />
                                    <div className="add-column-actions">
                                        <button type="submit" className="save-column-btn"><FaCheck /></button>
                                        <button type="button" onClick={() => setIsAddingColumn(false)} className="cancel-column-btn"><FaTimes /></button>
                                    </div>
                                </form>
                            ) : (
                                <button onClick={() => setIsAddingColumn(true)} className="add-column-button">
                                    <FaPlus /> Adicionar outro quadro
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </DragDropContext>
            {isModalOpen && <TaskModal task={editingTask} onClose={() => setIsModalOpen(false)} onSave={handleSaveTask} users={allUsers} columns={columns} onDelete={handleDeleteTask} />}
        </div>
    );
}
