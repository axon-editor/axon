import { useState } from "react";
import Sidebar from "./components/Sidebar";
import TabBar from "./components/TabBar";
import StatusBar from "./components/StatusBar";
import EditorPane from "./components/EditorPane";

function App() {
  const [activeFile, setActiveFile] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0f0f0f] overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar onFileSelect={setActiveFile} activeFile={activeFile} />
        <div className="flex flex-col flex-1 overflow-hidden">
          <TabBar activeFile={activeFile} onClose={() => setActiveFile(null)} />
          <EditorPane activeFile={activeFile} />
        </div>
      </div>
      <StatusBar activeFile={activeFile} />
    </div>
  );
}

export default App;
