export default function TestStylesPage() {
  return (
    <div className="p-8 bg-blue-500 text-white">
      <h1 className="text-4xl font-bold mb-4">Tailwind Test</h1>
      <div className="bg-red-500 p-4 rounded-lg mb-4">
        <p className="text-lg">Red background box</p>
      </div>
      <div className="bg-green-500 p-4 rounded-lg mb-4">
        <p className="text-lg">Green background box</p>
      </div>
      <button className="bg-yellow-500 text-black px-6 py-2 rounded hover:bg-yellow-600">
        Yellow Button
      </button>
    </div>
  );
}