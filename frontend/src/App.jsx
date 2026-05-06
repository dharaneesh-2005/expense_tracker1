import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const MarkdownMessage = ({ content }) => {
  const formatMarkdown = (text) => {
    let html = text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^## (.+)$/gm, '<h3>$1</h3>')
      .replace(/^# (.+)$/gm, '<h2>$1</h2>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    
    return `<p>${html}</p>`.replace(/<p><\/p>/g, '');
  };

  return <div dangerouslySetInnerHTML={{ __html: formatMarkdown(content) }} />;
};

function App() {
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [expenses, setExpenses] = useState([]);
  const [period, setPeriod] = useState('daily');
  const [report, setReport] = useState({ breakdown: [], total: 0 });
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);

  useEffect(() => {
    fetchExpenses();
    fetchReport(period);
  }, [period]);

  const fetchExpenses = async () => {
    const res = await fetch(`${API_URL}/expenses`);
    setExpenses(await res.json());
  };

  const fetchReport = async (p) => {
    const res = await fetch(`${API_URL}/reports/${p}`);
    setReport(await res.json());
  };

  const addExpense = async (e) => {
    e.preventDefault();
    await fetch(`${API_URL}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: parseFloat(amount), category, date })
    });
    setAmount('');
    setCategory('');
    setDate(new Date().toISOString().split('T')[0]);
    fetchExpenses();
    fetchReport(period);
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;
    
    setChatHistory([...chatHistory, { role: 'user', content: chatMessage }]);
    setLoading(true);
    
    const res = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: chatMessage })
    });
    
    const data = await res.json();
    setChatHistory([...chatHistory, 
      { role: 'user', content: chatMessage },
      { role: 'assistant', content: data.response }
    ]);
    setChatMessage('');
    setLoading(false);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setOcrLoading(true);
    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await fetch(`${API_URL}/ocr`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      
      setAmount(data.amount.toString());
      setCategory(data.category);
      setDate(data.date);
    } catch (error) {
      alert('Failed to extract data from image');
    }
    setOcrLoading(false);
    e.target.value = '';
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px', fontFamily: 'Arial' }}>
      <h1>Expense Tracker</h1>
      
      <form onSubmit={addExpense} style={{ marginBottom: '30px', padding: '20px', border: '1px solid #ddd' }}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ padding: '8px 20px', background: '#666', color: '#fff', cursor: 'pointer', borderRadius: '3px', display: 'inline-block' }}>
            {ocrLoading ? 'Processing...' : '📷 Upload Receipt'}
            <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} disabled={ocrLoading} />
          </label>
          <span style={{ marginLeft: '10px', fontSize: '14px', color: '#666' }}>or enter manually below</span>
        </div>
        <input
          type="number"
          placeholder="Amount (₹)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          style={{ padding: '8px', marginRight: '10px', width: '150px' }}
        />
        <input
          type="text"
          placeholder="Category (e.g., Food, Transport)"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          required
          style={{ padding: '8px', marginRight: '10px', width: '250px' }}
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          style={{ padding: '8px', marginRight: '10px', width: '150px' }}
        />
        <button type="submit" style={{ padding: '8px 20px', cursor: 'pointer', background: '#333', color: '#fff', border: 'none' }}>Add Expense</button>
      </form>

      <div style={{ marginBottom: '30px' }}>
        <div style={{ marginBottom: '10px' }}>
          {['daily', 'weekly', 'monthly'].map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                padding: '8px 16px',
                marginRight: '10px',
                cursor: 'pointer',
                background: period === p ? '#333' : '#fff',
                color: period === p ? '#fff' : '#000',
                border: '1px solid #333'
              }}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
        
        <div style={{ padding: '20px', border: '1px solid #ddd' }}>
          <h2>Total: ₹{report.total}</h2>
          
          <div style={{ display: 'flex', gap: '30px', marginTop: '20px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1', minWidth: '300px' }}>
              <h3>Bar Chart</h3>
              {report.breakdown.map((item, i) => {
                const percentage = report.total > 0 ? ((item.total / report.total) * 100).toFixed(1) : 0;
                return (
                  <div key={i} style={{ marginBottom: '15px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                      <span><strong>{item.category}</strong> ({item.count})</span>
                      <span>₹{item.total} ({percentage}%)</span>
                    </div>
                    <div style={{ width: '100%', height: '20px', background: '#eee', borderRadius: '3px' }}>
                      <div style={{ 
                        width: `${percentage}%`, 
                        height: '100%', 
                        background: '#333', 
                        borderRadius: '3px',
                        transition: 'width 0.3s'
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div style={{ flex: '0 0 300px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <h3>Pie Chart</h3>
              <svg width="250" height="250" viewBox="0 0 250 250">
                {report.breakdown.map((item, i) => {
                  const total = report.breakdown.reduce((sum, b) => sum + parseFloat(b.total), 0);
                  let startAngle = 0;
                  for (let j = 0; j < i; j++) {
                    startAngle += (parseFloat(report.breakdown[j].total) / total) * 360;
                  }
                  const angle = (parseFloat(item.total) / total) * 360;
                  const endAngle = startAngle + angle;
                  
                  const startRad = (startAngle - 90) * Math.PI / 180;
                  const endRad = (endAngle - 90) * Math.PI / 180;
                  
                  const x1 = 125 + 100 * Math.cos(startRad);
                  const y1 = 125 + 100 * Math.sin(startRad);
                  const x2 = 125 + 100 * Math.cos(endRad);
                  const y2 = 125 + 100 * Math.sin(endRad);
                  
                  const largeArc = angle > 180 ? 1 : 0;
                  const colors = ['#333', '#666', '#999', '#bbb', '#ddd', '#555', '#777', '#aaa'];
                  
                  return (
                    <path
                      key={i}
                      d={`M 125 125 L ${x1} ${y1} A 100 100 0 ${largeArc} 1 ${x2} ${y2} Z`}
                      fill={colors[i % colors.length]}
                      stroke="#fff"
                      strokeWidth="2"
                    />
                  );
                })}
              </svg>
              <div style={{ marginTop: '15px', width: '100%' }}>
                {report.breakdown.map((item, i) => {
                  const colors = ['#333', '#666', '#999', '#bbb', '#ddd', '#555', '#777', '#aaa'];
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
                      <div style={{ width: '15px', height: '15px', background: colors[i % colors.length], marginRight: '8px' }} />
                      <span style={{ fontSize: '14px' }}>{item.category}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          
          {report.breakdown.length > 0 && (
            <div style={{ marginTop: '30px', padding: '15px', background: '#f9f9f9', border: '1px solid #ddd' }}>
              <h3>Quick Insights</h3>
              <p><strong>Highest Spending:</strong> {report.breakdown[0]?.category} (₹{report.breakdown[0]?.total})</p>
              <p><strong>Average per Transaction:</strong> ₹{(report.total / report.breakdown.reduce((sum, item) => sum + parseInt(item.count), 0)).toFixed(2)}</p>
              <p><strong>Total Categories:</strong> {report.breakdown.length}</p>
            </div>
          )}
        </div>
      </div>

      <div style={{ border: '1px solid #ddd', padding: '20px' }}>
        <h2>AI Financial Advisor</h2>
        <div style={{ height: '300px', overflowY: 'auto', marginBottom: '10px', padding: '10px', background: '#f9f9f9' }}>
          {chatHistory.map((msg, i) => (
            <div key={i} style={{ marginBottom: '15px', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
              <div style={{
                display: 'inline-block',
                padding: '10px',
                background: msg.role === 'user' ? '#333' : '#fff',
                color: msg.role === 'user' ? '#fff' : '#000',
                borderRadius: '5px',
                maxWidth: '70%',
                textAlign: 'left',
                border: msg.role === 'assistant' ? '1px solid #ddd' : 'none'
              }}>
                {msg.role === 'user' ? msg.content : <MarkdownMessage content={msg.content} />}
              </div>
            </div>
          ))}
          {loading && <div>Analyzing...</div>}
        </div>
        <form onSubmit={sendMessage} style={{ display: 'flex' }}>
          <input
            type="text"
            placeholder="Ask about your spending..."
            value={chatMessage}
            onChange={(e) => setChatMessage(e.target.value)}
            style={{ flex: 1, padding: '8px', marginRight: '10px' }}
          />
          <button type="submit" disabled={loading} style={{ padding: '8px 20px', cursor: 'pointer' }}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;
