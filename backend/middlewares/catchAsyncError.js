export const catchAsyncError = (fnc) => {
    return (req,res,next) => {
        Promise.resolve(fnc(req,res,next)).catch(next);
    };
};