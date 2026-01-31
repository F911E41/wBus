// src/shared/ui/MarqueeText.tsx

// Marquee Component
const PopupMarquee = ({ text, maxLength = 12 }: { text: string; maxLength?: number }) => {
    const shouldMarquee = text.length > maxLength;

    if (!shouldMarquee) {
        return <span className="whitespace-nowrap block">{text}</span>;
    }

    return (
        // Parent: Cut off overflowing parts with overflow-hidden
        // Remove 'flex' and make it a block element (to avoid unnecessary flex interference)
        <div className="popup-marquee-container overflow-hidden w-full relative">
            <style>{`
                @keyframes infinite-scroll {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
                }
                .animate-infinite-scroll {
                    animation: infinite-scroll 6s linear infinite;
                    display: flex; /* Force to display horizontally */
                    width: max-content; /* Ensure it expands to fit content */
                }
            `}</style>

            {/* Animation Wrapper: 
                w-max (width: max-content) -> Ensure it expands to fit content
                flex-nowrap -> Prevent internal element wrapping
            */}
            <div className="animate-infinite-scroll flex-nowrap">
                {/* Text Elements: 
                    whitespace-nowrap -> Prevent line breaks
                    shrink-0 -> Prevent shrinking even if space is tight
                */}
                <span className="pr-6 font-medium text-gray-700 whitespace-nowrap shrink-0">
                    {text}
                </span>

                <span className="pr-6 font-medium text-gray-700 whitespace-nowrap shrink-0">
                    {text}
                </span>
            </div>
        </div>
    );
};

export default PopupMarquee;
