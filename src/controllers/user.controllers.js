// import { asyncHandler } from "../utils/asyncHandler";
// import { apiError } from "../utils/apiError";
// import { User } from "../models/user.model";

// const registerUser = asyncHandler( async(req, res) => {
//     const {fullName, email, username, password} = req.body

//     // validation 
//     if(
//         [fullName, email, username, password].some((field) =>
//         field?.trim === "")
//     ){
//         throw new apiError(400, "All fields are required.")
//     }

//     const existedUser = await User.findOne({
//         $or: [{username}, {email}]
//     })
//     if(existedUser) {
//         throw new apiError(409, "User with given username or email already exist.")
//     }

// })

// export { registerUser }