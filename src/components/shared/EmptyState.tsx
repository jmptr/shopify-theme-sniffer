interface EmptyStateProps {
  message: string;
}

export function EmptyState({ message }: EmptyStateProps) {
  return (
    <div className="text-center text-gray-400 text-[15px] py-12 px-6 leading-relaxed">
      {message}
    </div>
  );
}
