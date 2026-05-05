'use client';
import { useState, useRef } from 'react';
import { renameAccountAction } from '@/app/actions/rename-account';

export function RenameAccount({ id, name }: { id: string; name: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit() {
    await renameAccountAction(id, value);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        className="text-sm font-medium hover:underline text-left"
        onClick={() => { setEditing(true); setTimeout(() => inputRef.current?.select(), 0); }}
      >
        {value}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      className="text-sm font-medium border-b border-zinc-400 bg-transparent focus:outline-none w-full"
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={handleSubmit}
      onKeyDown={e => {
        if (e.key === 'Enter') handleSubmit();
        if (e.key === 'Escape') setEditing(false);
      }}
    />
  );
}
